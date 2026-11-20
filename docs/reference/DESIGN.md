# Observed client reference design

Capture date: 20 November 2026. This records reference evidence, not an approved VYUMI design.

## Evidence

[Reference product page](https://thepannashop.com/products/sa130205-msp-540754-tussar-black), Firecrawl page text and branding extraction, and five inspected frames from the supplied 52.33-second recording. The recording shows the Panna saree collection and an open shopping assistant; it does not demonstrate a completed personal try-on or merchant workflow. Audio was not transcribed.

The frame samples occur at approximately ten-second intervals. They establish desktop appearance, not every interaction or animation in the recording. The remote Firecrawl screenshot was retrieved as a URL but its pixels were not inspected; visual observations below come from the local video frames.

## Observed layout

- White storefront with a compact header, centered brand, search and account/cart actions; category navigation below it. Header stays visible while the collection scrolls in sampled frames.
- Desktop collection uses four columns of large portrait garment photos, narrow gutters and generous emphasis on imagery.
- Compact product names and prices below images, small discount/status badges, and wide muted-gold action buttons.
- A small chat launcher sits near the lower right. Its open state is a tall right-side shopping assistant panel with a colored header, welcome text, prompt chips and a bottom message composer.
- Product-page text lists multiple gallery images, color/size selection, a Try It On entry and expandable product information. These are text-supported elements; the recording primarily shows the collection page.

## Extracted tokens

These values came from Firecrawl's branding extraction of the product page. They may vary across widgets and page states; they are not manually verified CSS values.

| Role | Extracted value |
| --- | --- |
| Font | Urbanist, sans-serif |
| Page background | `#FFFFFF` |
| Main text | `#111111` |
| Primary brand gold | `#C5A649` |
| Link/accent | `#B08A3E` |
| Primary button background | `#846C30` |
| Secondary button background | `#0A2513` |
| Button text | `#FFFFFF` |
| Button border | `#EDEDED` |
| Heading samples | 20px h1, 18px h2 |
| Body sample | 14px |
| Spacing unit | 4px |

The extraction reports an 8px general radius but square primary/secondary buttons. Preserve component-specific differences rather than applying one radius everywhere. Spacing, container width and image ratio are visually estimated until implementation measurements are made.

## Image evidence

The page identifies hero, side, close-up, detail and blouse images. The image URLs are source references, not locally downloaded or licensed application assets:

- [Hero garment image](https://thepannashop.com/cdn/shop/files/download_259a6ba8-a2a7-4192-94b0-019a4023ebab.png?v=1792499812&width=1946)
- [Side image](https://thepannashop.com/cdn/shop/files/download_c6624a1b-b1fa-45b1-83de-b97252e57930.jpg?v=1792499812&width=1946)
- [Detail image](https://thepannashop.com/cdn/shop/files/download_96aba88c-c364-4a24-b01e-110f6ddbd08e.jpg?v=1792499812&width=1946)

The user's description calls the catalog imagery AI-generated. The recording itself does not establish how each displayed photo was made.

## Proposed adaptation and gaps

Use the collection proportions, imagery emphasis and product-scoped chat pattern with VYUMI branding and licensed assets. Merchant UI has no supplied visual reference; a compact product list and guided upload/generate/review flow are proposals.

Mobile layouts, keyboard behavior, focus handling, hover swaps, chat intelligence, upload dialogs, result screens and merchant pages have not been observed. Define and validate these rather than claiming exact replication. Ensure accessible contrast, focus states, meaningful image text, keyboard-operable dialogs, error association and announced generation status.

## Inspected recording frames

![Collection layout](video-frames/frame-02.jpg)

![Catalog imagery](video-frames/frame-03.jpg)

![Open shopping chat](video-frames/frame-05.jpg)
