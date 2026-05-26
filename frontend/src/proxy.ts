import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // List of public paths that don't require authentication
  const publicPaths = ["/login", "/register", "/"];
  const isPublicPath = publicPaths.includes(pathname);

  // Get token from cookies
  const token = request.cookies.get("access_token")?.value;

  // Redirect to login if no token and trying to access protected route
  if (!isPublicPath && !token) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - .svg, .png, .jpg, .jpeg, .gif, .webp (public assets)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
