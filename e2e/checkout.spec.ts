import crypto from "node:crypto";
import { expect, test, type APIRequestContext, type BrowserContext } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_URL || "http://localhost:4000";
const clientBaseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";

type ProductFixture = {
    id: number;
    price: number;
    salePrice: number | null;
    availableStock: number;
};

type AuthFixture = {
    idToken: string;
    userId?: string;
};

const env = (name: string) => process.env[name]?.trim() || "";

const configuredProductId = (prefix: string) => {
    const id = Number(env(`${prefix}_PRODUCT_ID`));
    return Number.isInteger(id) && id > 0 ? id : null;
};

const authFixture = (prefix: string): AuthFixture | null => {
    const idToken = env(`${prefix}_ID_TOKEN`) || `test-firebase:${prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-user`;
    return { idToken, userId: env(`${prefix}_USER_ID`) || undefined };
};

const requestFailure = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
    const response = await request.get(`${apiBaseUrl}${path}`);
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<T>;
}

async function csrfHeaders(context: BrowserContext) {
    const response = await context.request.get(`${apiBaseUrl}/api/csrf`);
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as { csrfToken?: string };
    expect(body.csrfToken).toBeTruthy();
    return { "x-csrf-token": body.csrfToken as string };
}

async function signIn(context: BrowserContext, fixture: AuthFixture) {
    if (fixture.idToken.startsWith("test-firebase:")) {
        const username = `e2e${fixture.idToken.slice("test-firebase:".length).replace(/[^a-z0-9]/gi, "").slice(0, 12)}`.slice(0, 15);
        await context.request.post(`${apiBaseUrl}/api/users/register`, {
            data: { idToken: fixture.idToken, user: { username: username || "e2euser" } },
        });
    }
    const response = await context.request.post(`${apiBaseUrl}/api/users/login`, {
        data: { idToken: fixture.idToken, rememberMe: false },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const body = (await response.json()) as { userData?: { id?: string | number } };
    const userId = String(body.userData?.id || fixture.userId || "");
    expect(userId).toBeTruthy();
    if (fixture.userId) expect(userId).toBe(fixture.userId);
    return userId;
}

async function readProduct(request: APIRequestContext, productId: number): Promise<ProductFixture> {
    const body = await getJson<{ product?: Record<string, unknown> }>(request, `/api/products/${productId}`);
    const product = body.product || {};
    const price = Number(product.price || 0);
    const salePrice = product.sale_price === null || product.sale_price === undefined
        ? null
        : Number(product.sale_price) || null;
    const availableStock = Number(product.available_stock ?? product.stock ?? 0);
    expect(price).toBeGreaterThan(0);
    return { id: productId, price, salePrice, availableStock };
}

async function resolveProduct(request: APIRequestContext, prefix: string, searchTerm: string): Promise<ProductFixture | null> {
    const configuredId = configuredProductId(prefix);
    if (configuredId) return readProduct(request, configuredId);

    const body = await getJson<{ products?: Array<{ id?: number }> }>(
        request,
        `/api/products?term=${encodeURIComponent(searchTerm)}&limit=10`,
    );
    const productId = Number(body.products?.[0]?.id);
    return Number.isInteger(productId) && productId > 0 ? readProduct(request, productId) : null;
}

async function addProductToCart(context: BrowserContext, userId: string, productId: number) {
    const headers = await csrfHeaders(context);
    const response = await context.request.post(`${apiBaseUrl}/api/cart`, {
        headers,
        data: { uid: userId, pid: productId, quantity: 1 },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
}

async function createStripeCheckout(context: BrowserContext, userId: string, product: ProductFixture) {
    const headers = await csrfHeaders(context);
    const unitPrice = product.salePrice ?? product.price;
    const response = await context.request.post(`${apiBaseUrl}/api/orders/checkout-session/${userId}`, {
        headers,
        data: {
            cart: [{ productId: product.id, quantity: 1, price: product.price, sale_price: product.salePrice }],
            totalPrice: unitPrice,
            discount: 0,
            shippingAddress: "E2E checkout address",
        },
    });
    return { response, body: (await response.json()) as { url?: string } };
}

function stripeSessionId(url: string) {
    const match = url.match(/(cs_(?:test|live)_[A-Za-z0-9_]+)/);
    expect(match, `Expected a Stripe checkout session id in ${url}`).not.toBeNull();
    return match?.[1] as string;
}

async function postStripeEvent(context: BrowserContext, type: "checkout.session.expired" | "checkout.session.completed", sessionId: string) {
    const secret = env("E2E_STRIPE_WEBHOOK_SECRET");
    const usesTestAdapter = process.env.NODE_ENV === "test";
    test.skip(!secret && !usesTestAdapter, "requires E2E_STRIPE_WEBHOOK_SECRET matching the test server");

    const payload = JSON.stringify({
        id: `evt_${type.replaceAll(".", "_")}_${sessionId}`,
        object: "event",
        created: Math.floor(Date.now() / 1000),
        data: {
            object: {
                id: sessionId,
                object: "checkout.session",
                payment_intent: type === "checkout.session.completed" ? `pi_${sessionId}` : null,
            },
        },
        livemode: false,
        pending_webhooks: 1,
        type,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = usesTestAdapter
        ? "test-adapter"
        : crypto.createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const headers = await csrfHeaders(context);
    const response = await context.request.post(`${apiBaseUrl}/api/orders/webhooks/stripe`, {
        headers: {
            ...headers,
            "stripe-signature": usesTestAdapter ? signature : `t=${timestamp},v1=${signature}`,
            "content-type": "application/json",
        },
        data: payload,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("checkout regressions", () => {
    test("completes a COD checkout through the real UI boundary", async ({ browser }) => {
        const customer = authFixture("E2E_COD");
        test.skip(!customer, "unable to create the deterministic E2E customer fixture");

        const context = await browser.newContext({ baseURL: clientBaseUrl });
        try {
            let userId: string;
            let before: ProductFixture;
            try {
                userId = await signIn(context, customer as AuthFixture);
                before = await resolveProduct(context.request, "E2E_COD", "E2E COD Checkout Fixture") as ProductFixture;
                await addProductToCart(context, userId, before.id);
            } catch (error) {
                throw new Error(`COD fixture/API is not available: ${requestFailure(error)}`, { cause: error });
            }

            const page = await context.newPage();
            await page.goto("/cart");
            await expect(page.locator("article.cart-item")).toHaveCount(1);
            await page.getByRole("button", { name: /Proceed to checkout/i }).click();
            await expect(page.getByRole("dialog")).toBeVisible();
            await page.getByRole("button", { name: /Place order/i }).click();

            await expect(page).toHaveURL(/\/cart$/);
            await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
            await page.getByLabel("First name").fill("E2E");
            await page.getByLabel("Last name").fill("Customer");
            await page.getByLabel("Shipping address").fill("E2E checkout address");
            await page.getByLabel("City").fill("Ho Chi Minh City");
            await page.getByLabel("Cash on delivery").check();
            await page.getByRole("button", { name: "Place order" }).click();

            await expect(page).toHaveURL(/\/checkout-success$/);
            await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();

            const ordersBody = await getJson<{ orders?: Array<{ id: number }> }>(context.request, `/api/orders/user/${userId}`);
            expect(ordersBody.orders?.length).toBeGreaterThan(0);
            const latestOrderId = ordersBody.orders?.[0]?.id;
            expect(latestOrderId).toBeTruthy();

            const after = await readProduct(context.request, before.id);
            expect(after.availableStock).toBe(before.availableStock - 1);

            await page.goto(`/orders?order=${latestOrderId}`);
            await expect(page.getByRole("heading", { name: "Order history" })).toBeVisible();
            await expect(page.getByText(`Order #${latestOrderId}`)).toBeVisible();
        } finally {
            await context.close();
        }
    });

    test("reserves, releases, and finalizes Stripe checkout idempotently", async ({ browser }) => {
        const firstCustomer = authFixture("E2E_STRIPE");
        const secondCustomer = authFixture("E2E_STRIPE_SECOND");
        test.skip(
            !firstCustomer || !secondCustomer,
            "unable to create the deterministic E2E customer fixtures",
        );

        const firstContext = await browser.newContext({ baseURL: clientBaseUrl });
        const secondContext = await browser.newContext({ baseURL: clientBaseUrl });
        try {
            let firstUserId: string;
            let secondUserId: string;
            let product: ProductFixture;
            let beforeOrderIds: number[];
            try {
                firstUserId = await signIn(firstContext, firstCustomer as AuthFixture);
                secondUserId = await signIn(secondContext, secondCustomer as AuthFixture);
                product = await resolveProduct(firstContext.request, "E2E_STRIPE", "E2E Stripe Checkout Fixture") as ProductFixture;
                test.skip(product.availableStock !== 1, `Stripe fixture must start with exactly one available unit; found ${product.availableStock}`);
                await addProductToCart(firstContext, firstUserId, product.id);
                await addProductToCart(secondContext, secondUserId, product.id);
                const existingOrders = await getJson<{ orders?: Array<{ id: number }> }>(secondContext.request, `/api/orders/user/${secondUserId}`);
                beforeOrderIds = (existingOrders.orders || []).map((order) => order.id);
            } catch (error) {
                throw new Error(`Stripe fixture/API is not available: ${requestFailure(error)}`, { cause: error });
            }

            const firstCheckout = await createStripeCheckout(firstContext, firstUserId, product);
            expect(firstCheckout.response.status()).toBe(200);
            const firstSessionId = stripeSessionId(firstCheckout.body.url || "");

            const secondWhileReserved = await createStripeCheckout(secondContext, secondUserId, product);
            expect(secondWhileReserved.response.status()).toBe(409);

            await postStripeEvent(firstContext, "checkout.session.expired", firstSessionId);

            const secondAfterExpiry = await createStripeCheckout(secondContext, secondUserId, product);
            expect(secondAfterExpiry.response.status()).toBe(200);
            const secondSessionId = stripeSessionId(secondAfterExpiry.body.url || "");

            await postStripeEvent(secondContext, "checkout.session.completed", secondSessionId);
            await postStripeEvent(secondContext, "checkout.session.completed", secondSessionId);

            const finalized = await getJson<{ order?: { id: number } }>(secondContext.request, `/api/orders/by-session/${secondSessionId}`);
            expect(finalized.order?.id).toBeTruthy();

            const ordersAfter = await getJson<{ orders?: Array<{ id: number }> }>(secondContext.request, `/api/orders/user/${secondUserId}`);
            const newOrders = (ordersAfter.orders || []).filter((order) => !beforeOrderIds.includes(order.id));
            expect(newOrders).toHaveLength(1);

            const after = await readProduct(secondContext.request, product.id);
            expect(after.availableStock).toBe(0);
        } finally {
            await firstContext.close();
            await secondContext.close();
        }
    });
});
