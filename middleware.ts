import { createMiddleware } from "./server/kindred/vercel-middleware.js";

// Ana's pages are walled by Kindred ID; everything else (Rosa's phone, the mailbox phone, the API) stays open here.
export const config = { matcher: ["/ana", "/ana/:path*"] };
export default createMiddleware();
