import { useAuth } from "@clerk/astro/react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";

const convexUrl = import.meta.env.PUBLIC_CONVEX_URL as string | undefined;

const client = convexUrl ? new ConvexReactClient(convexUrl) : null;

type ConvexAuthShape = {
  isLoading: boolean;
  isAuthenticated: boolean;
  fetchAccessToken: (args: {
    forceRefreshToken: boolean;
  }) => Promise<string | null>;
};

const defaultConvexAuth: ConvexAuthShape = {
  isLoading: true,
  isAuthenticated: false,
  fetchAccessToken: async () => null,
};

const ConvexAuthBridgeContext =
  createContext<ConvexAuthShape>(defaultConvexAuth);

function useConvexAuthBridge() {
  return useContext(ConvexAuthBridgeContext);
}

function ConvexProviderBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      if (!isSignedIn) {
        return null;
      }

      try {
        return (
          (await getToken({
            template: "convex",
            skipCache: forceRefreshToken,
          })) ?? null
        );
      } catch (error) {
        console.error("Failed to fetch Clerk token for Convex:", error);
        return null;
      }
    },
    [getToken, isSignedIn],
  );

  const auth = useMemo(
    () => ({
      isLoading: !isLoaded,
      isAuthenticated: !!isSignedIn,
      fetchAccessToken,
    }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );

  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexAuthBridgeContext.Provider value={auth}>
      <ConvexProviderWithAuth client={client} useAuth={useConvexAuthBridge}>
        {children}
      </ConvexProviderWithAuth>
    </ConvexAuthBridgeContext.Provider>
  );
}

export function withConvexProvider<Props extends object>(
  Component: (props: Props) => ReactNode,
) {
  return function WithConvexProvider(props: Props) {
    return (
      <ConvexProviderBridge>
        <Component {...props} />
      </ConvexProviderBridge>
    );
  };
}

export function isConvexConfigured() {
  return Boolean(convexUrl);
}
