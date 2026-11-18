# MatMove Admin mobile responsiveness

- Added a compact responsive baseline to the Admin console's previously minimal global stylesheet.
- Supports 320px minimum width, small-phone layout adjustments, tablet/mobile breakpoints, landscape short-screen handling and dynamic viewport height.
- Adds safe-area padding, 16px form-control text, horizontal table scrolling, reduced-motion handling and 44px touch targets for navigation and frequent actions.
- Existing Tailwind responsive layouts and staff permission checks are preserved. No Admin authentication, staff roles, Supabase schema, financial APIs or authorization logic were changed.
- This is a CSS/static regression pass. Browser screenshot checks at the specified phone/tablet/desktop widths and real-device testing remain outstanding.
