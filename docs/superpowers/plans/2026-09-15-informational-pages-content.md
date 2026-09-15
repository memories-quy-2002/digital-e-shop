# Informational Pages Content Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the static English and Vietnamese content for About, News, Support, and Contact so it is persuasive, professional, and grounded in Digital-E's implemented customer experience.

**Architecture:** Keep the existing React Router pages, SCSS layouts, support-ticket flow, and static News article map. Store all user-facing copy in the existing locale dictionaries, add only the localized metadata/alt/value keys needed by the current components, and do not introduce live news fetching or external content dependencies.

**Tech Stack:** React 19, TypeScript, Vite, React Router, `react-helmet-async`, existing `useT`/`LocaleProvider`, Vitest, Testing Library, pnpm.

## Global Constraints

- Keep client and server independent; change only `client/` plus this plan.
- Preserve the existing routes: `/about-us`, `/news`, `/news/:slug`, `/support`, and `/contact-us`.
- Keep the existing support-ticket API, authentication redirect, session-storage draft, CSRF, and contact-channel destinations unchanged.
- Keep demo email, phone, office address, and business-stat values; do not present new personal or business data.
- Ground capability claims in the current catalog, product detail, checkout, order history, account, wishlist, notification, and support-ticket flows.
- Keep the five static News slugs and date formatting behavior stable; this task does not add RSS/API/news scraping.
- Maintain matching English and Vietnamese dictionary shapes and natural, benefit-led translations.
- Do not add dependencies, alter the backend, or redesign the existing informational-page layouts.

## Content direction

Use one consistent promise across the pages: Digital-E makes technology shopping easier to understand from product discovery through checkout, order visibility, and support.

- About explains why the experience is trustworthy and reframes the current timeline as the customer journey instead of making unsupported company-history claims.
- News becomes an editorial reading section: practical buying guidance and service insights based on the current product and order experience, without pretending to be a real-time news feed.
- Support leads with clear routes for order, payment, delivery, returns, warranty, and account questions, without promising an unverified service-level agreement.
- Contact makes the authenticated request flow explicit while keeping the guest draft/redirect behavior intact.

### Task 1: Refresh English and Vietnamese page dictionaries

**Files:**
- Modify: `client/src/i18n/en.ts`
- Modify: `client/src/i18n/vi.ts`

**Interfaces:**
- Consumes: existing `useT` keys used by the four informational pages.
- Produces: matching `about`, `news`, `support`, and `contact` dictionary entries for page copy, localized metadata, image alt text, and the About stat value.

- [ ] **Step 1: Replace About copy with factual, customer-centered language**

Use these English messages:

```ts
about: {
    title: "About Digital-E",
    metaDescription:
        "Learn how Digital-E makes electronics shopping clearer with curated products, transparent checkout, order visibility, and practical support.",
    heroAlt: "Digital-E electronics and mobile technology selection",
    subtitle: "Choose with confidence, checkout with clarity, and get support after the sale.",
    explore: "Explore the catalog",
    getSupport: "Contact support",
    stats: {
        products: "Products to explore",
        brands: "Brands to compare",
        support: "Support when needed",
        orderTime: "Clear order visibility",
        orderValue: "Clear",
    },
    principlesHeading: "What we stand for",
    values: [
        {
            title: "Curated, not crowded",
            desc: "We focus on electronics and components with useful product information so you can compare what fits your needs.",
        },
        {
            title: "Clear before you commit",
            desc: "Product details, availability, pricing, promotions, and payment choices are surfaced before an order is placed.",
        },
        {
            title: "Support that follows through",
            desc: "When a question needs a human answer, a support ticket keeps the request visible from the first message to the next step.",
        },
    ],
    missionHeading: "From discovery to delivery",
    missionText:
        "Make technology shopping feel less uncertain with useful product information, clear checkout decisions, visible order progress, and support that stays practical.",
    milestones: [
        { year: "01", text: "Discover products by category, use case, and the details that matter to you." },
        { year: "02", text: "Compare specifications, availability, warranty information, and customer signals before buying." },
        { year: "03", text: "Review stock, price, promotion conditions, delivery details, and payment at checkout." },
        { year: "04", text: "Follow the order afterward and contact support when you need a clear next step." },
    ],
    teamHeading: "How we help",
    teamSubtitle: "Practical support at every stage",
    team: [
        { name: "Product guidance", detail: "Turns specifications and warranty details into clearer buying decisions." },
        { name: "Order operations", detail: "Keeps pricing, availability, checkout, and order updates aligned." },
        { name: "Customer support", detail: "Helps with account, delivery, payment, return, and warranty questions." },
    ],
},
```

Use the Vietnamese equivalent with the same keys and structure:

```ts
about: {
    title: "Về Digital-E",
    metaDescription:
        "Tìm hiểu cách Digital-E giúp việc mua sắm thiết bị điện tử rõ ràng hơn, từ chọn sản phẩm đến thanh toán, theo dõi đơn và hỗ trợ.",
    heroAlt: "Danh mục thiết bị điện tử và công nghệ di động của Digital-E",
    subtitle: "Chọn đúng công nghệ, thanh toán rõ ràng và luôn có hỗ trợ sau khi mua.",
    explore: "Khám phá danh mục",
    getSupport: "Liên hệ hỗ trợ",
    stats: {
        products: "Sản phẩm để khám phá",
        brands: "Thương hiệu để so sánh",
        support: "Hỗ trợ khi cần",
        orderTime: "Theo dõi đơn rõ ràng",
        orderValue: "Rõ ràng",
    },
    principlesHeading: "Điều chúng tôi theo đuổi",
    values: [
        {
            title: "Chọn lọc, không dàn trải",
            desc: "Digital-E tập trung vào thiết bị và linh kiện điện tử cùng thông tin hữu ích để bạn dễ so sánh theo nhu cầu.",
        },
        {
            title: "Rõ ràng trước khi mua",
            desc: "Thông tin sản phẩm, tình trạng hàng, giá, khuyến mãi và phương thức thanh toán được thể hiện trước khi bạn đặt hàng.",
        },
        {
            title: "Hỗ trợ đến nơi đến chốn",
            desc: "Khi câu hỏi cần người xử lý, ticket hỗ trợ giúp yêu cầu được ghi nhận và theo dõi từ tin nhắn đầu tiên đến bước tiếp theo.",
        },
    ],
    missionHeading: "Từ lúc chọn đến lúc nhận hàng",
    missionText:
        "Giúp việc mua sắm công nghệ bớt mơ hồ bằng thông tin hữu ích, checkout minh bạch, trạng thái đơn dễ theo dõi và hỗ trợ thực tế.",
    milestones: [
        { year: "01", text: "Khám phá sản phẩm theo danh mục, nhu cầu sử dụng và những thông tin quan trọng." },
        { year: "02", text: "So sánh thông số, tình trạng hàng, thông tin bảo hành và tín hiệu từ khách hàng trước khi mua." },
        { year: "03", text: "Kiểm tra tồn kho, giá, điều kiện khuyến mãi, giao hàng và thanh toán tại checkout." },
        { year: "04", text: "Theo dõi đơn hàng sau khi đặt và liên hệ hỗ trợ khi cần một hướng xử lý rõ ràng." },
    ],
    teamHeading: "Cách chúng tôi hỗ trợ",
    teamSubtitle: "Hỗ trợ thực tế ở từng chặng mua sắm",
    team: [
        { name: "Thông tin sản phẩm", detail: "Biến thông số và thông tin bảo hành thành lựa chọn dễ hiểu hơn." },
        { name: "Vận hành đơn hàng", detail: "Giữ giá, tồn kho, checkout và cập nhật đơn hàng đồng bộ." },
        { name: "Chăm sóc khách hàng", detail: "Hỗ trợ câu hỏi về tài khoản, giao hàng, thanh toán, đổi trả và bảo hành." },
    ],
},
```

- [ ] **Step 2: Replace News copy with evergreen editorial content**

Keep the existing five `NEWS_ARTICLES` keys, slugs, dates, and read times. Replace their localized title, excerpt, author, and body values with the approved editorial themes: choosing a technology store clearly, choosing laptops by workload, checking an order before checkout, choosing audio by environment, and why honest availability matters. Use the following English page-level copy:

```ts
title: "News & buying guides",
subtitle: "Practical insights, product guidance, and updates from the Digital-E team.",
browseNewArrivals: "Explore the catalog",
visitSupport: "Get support",
briefs: [
    "Compare products by real use",
    "See the details before checkout",
    "Follow every order step",
    "Help when you need it",
],
readArticle: "Read the guide",
backToNews: "Back to News",
metaDescription: "Practical electronics buying guides, product insights, and service updates from Digital-E.",
sectionEyebrow: "From the Digital-E desk",
sectionTitle: "Useful reading for better technology decisions",
```

Use matching Vietnamese page-level copy:

```ts
title: "Tin tức & hướng dẫn mua",
subtitle: "Góc nhìn thực tế, hướng dẫn chọn sản phẩm và cập nhật từ Digital-E.",
browseNewArrivals: "Khám phá danh mục",
visitSupport: "Nhận hỗ trợ",
briefs: [
    "So sánh theo nhu cầu sử dụng",
    "Xem rõ trước khi checkout",
    "Theo dõi từng bước đơn hàng",
    "Hỗ trợ khi cần",
],
readArticle: "Đọc bài viết",
backToNews: "Quay lại Tin tức",
metaDescription: "Hướng dẫn mua thiết bị điện tử, góc nhìn sản phẩm và cập nhật dịch vụ từ Digital-E.",
sectionEyebrow: "Từ bàn biên tập Digital-E",
sectionTitle: "Nội dung hữu ích cho quyết định công nghệ tốt hơn",
```

The featured English story must be titled `A clearer way to choose and buy technology`, with excerpt `From product details to order tracking, Digital-E brings the decisions that matter into one straightforward shopping experience.` The remaining stories must use benefit-led titles and excerpts that do not claim real-time releases or unsupported policies. The Vietnamese stories must be natural translations, not word-for-word output.

- [ ] **Step 3: Refresh Support and Contact copy without changing behavior**

Use Support language that names real routes and avoids an unverified response SLA. The English hero/channel/resource/FAQ anchors are:

```ts
heroSubtitle: "Clear answers and practical next steps, from product questions to post-order help.",
contactHeading: "Get help in the way that suits your question",
contactFormTitle: "Send a support request",
contactFormDetail: "Sign in to submit and keep the request connected to your account",
resourcesHeading: "Start with the most common topics",
faqHeading: "Straight answers for the moments that matter",
faq2Answer: "Contact us as soon as possible. We can review the order status and explain what options are still available; changes are easier before packing or dispatch.",
faq3Answer: "Checkout checks availability before an order is placed. If a stock issue appears afterward, support will explain the available replacement or refund next step.",
faq4Answer: "Enter the code in the cart and review the validation result before checkout. Promotions can have dates, minimum order values, or usage limits.",
```

Use the same structure in Vietnamese, with direct CTAs for order history, contact form, email, phone, returns, warranty, and payment. Keep the existing demo `support@digital-e.com`, `+84 123 456 789`, and internal route destinations.

Contact must make the auth requirement clear in copy while preserving the current draft redirect. Use these English anchors:

```ts
title: "Contact Digital-E",
subtitle: "Tell us what you need, and we’ll help you find the next useful step.",
formHeading: "Tell us how we can help",
nameLabel: "Full name",
messageLabel: "How can we help?",
messagePlaceholder: "Include an order number or product name if it helps us understand your question.",
sendButton: "Send request",
replyNote: "Sign in to submit your request securely. We’ll keep the next step clear.",
guestTitle: "Sign in to send your request",
guestBody: "Your message is saved for this session. Sign in to continue without starting over.",
submitSuccess: "Request sent",
submitError: "We couldn’t send your request",
```

Use natural Vietnamese equivalents, retain the demo direct-channel values, and keep all validation/loading/error/success messages localized.

### Task 2: Wire the new localized metadata and stat value

**Files:**
- Modify: `client/src/pages/AboutUsPage.tsx:37-42, 58-78`

**Interfaces:**
- Consumes: `about.metaDescription`, `about.heroAlt`, and `about.stats.orderValue` from both dictionaries.
- Produces: localized About metadata, hero alt text, and the non-placeholder fourth stat value without changing the page layout.

- [ ] **Step 1: Use the About dictionary for metadata and hero alt text**

Replace the hardcoded description and image alt with:

```tsx
<meta name="description" content={t("about.metaDescription")} />
...
alt={t("about.heroAlt")}
```

- [ ] **Step 2: Replace the hardcoded `UTC` stat value**

Keep the demo numeric values `5K+`, `120+`, and `24/7`, but render the fourth value from the locale dictionary:

```tsx
<strong>{t("about.stats.orderValue")}</strong>
<span>{t("about.stats.orderTime")}</span>
```

### Task 3: Update focused regression coverage

**Files:**
- Modify: `client/src/pages/__tests__/NewsPage.test.tsx`
- Modify: `client/src/pages/__tests__/ContactUsPage.test.tsx`
- Create: `client/src/pages/__tests__/AboutUsPage.test.tsx`

**Interfaces:**
- Consumes: the existing page components and locale dictionaries.
- Produces: focused checks that the refreshed static copy is rendered and that existing links/auth behavior remain stable.

- [ ] **Step 1: Update News expectations for the new editorial titles**

Keep the stable slug and date assertions. Change the detail-page heading assertions to the refreshed checkout, featured, and audio titles. Continue asserting five `Read the guide` links and the same five hrefs.

- [ ] **Step 2: Update Contact expectations for the renamed localized labels**

Change the form queries and toast expectations to `Full name`, `How can we help?`, `Send request`, `Preparing your contact form…`, `Sign in to send your request`, and `We couldn’t send your request`. Keep assertions for the session-storage draft, safe redirect, direct `mailto:`/`tel:` links, and API call boundaries.

- [ ] **Step 3: Add About rendering coverage**

Render `AboutUsPage` with `LocaleProvider` and `MemoryRouter`, mock `Layout` and `Helmet` like the neighboring tests, and assert the English heading, refreshed mission heading, journey item `01`, support CTA, and localized `Clear` stat value. This verifies the new dictionary keys are consumed by the page.

### Task 4: Verify the client change

**Files:**
- No source changes; run checks against the scoped client package.

- [ ] **Step 1: Run the focused informational-page tests**

Run:

```powershell
pnpm --dir client exec vitest run src/pages/__tests__/AboutUsPage.test.tsx src/pages/__tests__/ContactUsPage.test.tsx src/pages/__tests__/NewsPage.test.tsx src/pages/__tests__/SupportPage.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 2: Run client typecheck and build**

Run:

```powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
```

Expected: both commands exit successfully and the build emits the client bundle.

- [ ] **Step 3: Run client lint and diff checks**

Run:

```powershell
pnpm --dir client lint
git diff --check
```

Expected: lint reports no errors and `git diff --check` reports no whitespace errors. Existing unrelated auth changes must remain outside the content diff.
