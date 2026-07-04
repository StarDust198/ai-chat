export const publicRoutes = {
  signin: {
    title: "Sign In",
    url: "/signin",
  },
  signup: {
    title: "Sign Up",
    url: "/signup",
  },
  // home: {
  //   title: "Homepage",
  //   url: "/",
  // },
  // about: {
  //   title: "About",
  //   url: "/about",
  // },
} as const;

export const privateRoutes = {
  // chat: {
  //   title: "New chat",
  //   url: "/chat",
  // },
  // settings: {
  //   title: "Settings",
  //   url: "/settings",
  // },
} as const;

export const routes = {
  ...publicRoutes,
  ...privateRoutes,
} as const;

export type RouteKey = keyof typeof routes;
export type RouteData = (typeof routes)[RouteKey];
export type RouteUrl = RouteData["url"];
export type RouteTitle = RouteData["title"];

export const urlByTitle = Object.fromEntries(
  Object.values(routes).map((route) => [route.title, route.url]),
);

export const titleByUrl = Object.fromEntries(
  Object.values(routes).map((route) => [route.url, route.title]),
);

export const NEW_CHAT_TITLE = "New Chat";
export const SIGN_OUT_TITLE = "Sign Out";
