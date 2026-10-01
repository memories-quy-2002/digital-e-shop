# Image Delivery Optimization Implementation Plan

> **For agentic workers:** Execute inline in the current branch. Keep each change within the image delivery scope and preserve unrelated working-tree edits.

**Goal:** Reduce image bytes and discovery delay while preserving eager, high-priority loading for likely LCP images.

**Architecture:** The existing Nest Blob service will generate real WebP and AVIF width variants with Sharp during admin uploads and serve them as immutable, public Blob objects. The client will build responsive candidates only for known variants or resizable Unsplash URLs, render AVIF sources with WebP fallback, and keep below-fold images lazy. The blob upload response and product database fields remain unchanged.

**Tech Stack:** React 19, TypeScript, NestJS, Vercel Blob, Sharp, Vite.

## Global Constraints

- Keep client and server as independent pnpm packages.
- Do not add dependencies or change the database schema.
- Preserve the `/api/blob/upload` response keys and product image storage contract.
- Do not create Blob `?w=` candidates because Blob URLs do not transform on that query.
- Preserve Home and Product Detail eager/high-priority image behavior.
- Do not modify unrelated existing working-tree changes.

---

### Task 1: Share optimized image uploads

**Files:**
- Modify: `server/src/blob/blob.service.ts`
- Modify: `server/src/blob/blob.module.ts`
- Modify: `server/src/products/products.module.ts`
- Modify: `server/src/products/products.service.ts`

- [x] Validate upload bytes as JPEG, PNG, WebP, or AVIF with Sharp's input-pixel limit.
- [x] Generate WebP and AVIF variants at 320, 640, 960, and 1280 pixels, capped to the oriented source width so no output is enlarged.
- [x] Upload variants under stable sibling filenames with explicit content types and one-year cache age; return the largest WebP URL using the existing result shape.
- [x] Export the Blob service and use it for the product-create file fallback so both upload routes share processing.
- [x] Keep the product DB value as the final filename without its extension and include a recognizable width marker so the client resolves the new WebP URL.

### Task 2: Build valid responsive sources

**Files:**
- Modify: `client/src/utils/images.ts`

- [x] Replace Blob query-string width candidates with sibling URLs that match generated variants.
- [x] Return AVIF and WebP candidate sets for newly optimized Blob images.
- [x] For `images.unsplash.com`, set `w` to each requested candidate width and preserve the existing format negotiation query.
- [x] Return only the original URL for legacy Blob and other sources that have no known transform or variant support.
- [x] Resolve filename-only new product images to their WebP primary URL while retaining legacy `.jpg` behavior.

### Task 3: Render responsive images and protect LCP

**Files:**
- Modify: `client/src/utils/LazyLoadingImage.tsx`
- Modify: `client/src/utils/loadImage.tsx`
- Modify: `client/src/components/common/ProductCard.tsx`
- Modify: `client/src/components/common/ShopsItem.tsx`
- Modify: `client/src/components/common/PaginatedItems.tsx`
- Modify: `client/src/components/common/ImageLightbox.tsx`
- Modify: `client/src/pages/HomePage.tsx`
- Modify: `client/src/features/products/pages/ProductPage.tsx`
- Modify: `client/src/features/products/pages/ProductComparisonPage.tsx`
- Modify: `client/src/features/admin/components/ProductForm.tsx`

- [x] Let the lazy image wrapper install AVIF, WebP `srcset`, `sizes`, and `src` in that order when an image approaches the viewport.
- [x] Mark the first three Shop cards eager and only the first one high priority; keep later cards lazy.
- [x] Keep Home and Product Detail preloads aligned to their responsive candidate and size attributes.
- [x] Use AVIF sources where generated variants exist, with WebP as the fallback.
- [x] Accept AVIF uploads in the Admin picker and show the responsive uploaded preview.
- [x] Clear responsive sources when falling back to the local placeholder.

### Task 4: Document current image behavior

**Files:**
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

- [x] Record upload-time image variants, cache policy, legacy-image fallback, responsive delivery, and LCP loading rules.
- [x] Keep the index date current and append one concise log entry.

### Task 5: Verify and review

- [x] Run `pnpm --dir client exec tsc -p tsconfig.json --noEmit`.
- [x] Run `pnpm --dir client build` and `pnpm --dir client lint`.
- [x] Run `pnpm --dir server typecheck`, `pnpm --dir server build`, and `pnpm --dir server lint`.
- [x] Use the browser harness on Home, Shop, and Product Detail at desktop/mobile sizes. Home's product image remains eager/high and all three routes fit the mobile viewport; Shop and Product Detail source selection could not be verified because the local API/database returned no products.
- [x] Review the final diff and confirm the pre-existing `.gitignore` modification was left untouched.
