import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JsonRpcProvider, type Provider, type Signer } from "ethers";

import type { BffClient } from "../../lib/bffClient";
import { mapEthersError } from "../../lib/errors";
import { subscribeWalletLifecycle } from "../../lib/wallet";
import type {
  ChainTicketClient,
  ContractConfig,
  EmbeddedWalletSession,
  RuntimeConfig,
  UserRoles,
  WalletProviderInfo,
} from "../../types/chainticket";
import { EMPTY_ROLES, type ClientFactory, type WalletConnector } from "./types";

const EMBEDDED_WALLET_STORAGE_KEY = "chainticket.embedded-wallet.session";

interface WalletSessionArgs {
  contractConfig: ContractConfig;
  runtimeConfig: RuntimeConfig;
  hasValidConfig: boolean;
  createClient: ClientFactory;
  createSponsoredClient: (config: ContractConfig, options: {
    address: string;
    sessionToken: string;
    bffClient: BffClient;
    providerInfo: WalletProviderInfo;
  }) => ChainTicketClient;
  walletConnector: WalletConnector;
  readClient: ChainTicketClient | null;
  bffClient: BffClient | null;
  clearMessages: () => void;
  setErrorMessage: (message: string) => void;
  setStatusMessage: (message: string) => void;
}

interface WalletSessionResult {
  walletProviders: WalletProviderInfo[];
  selectedProviderId: string;
  setSelectedProviderId: (providerId: string) => void;
  embeddedWalletEnabled: boolean;
  embeddedWalletEmail: string;
  setEmbeddedWalletEmail: (email: string) => void;
  embeddedWalletCode: string;
  setEmbeddedWalletCode: (code: string) => void;
  embeddedWalletSession: EmbeddedWalletSession | null;
  embeddedWalletDevCode: string | null;
  isEmbeddedWalletBusy: boolean;
  requestEmbeddedWalletCode: () => Promise<void>;
  verifyEmbeddedWalletCode: () => Promise<void>;
  connectedProvider: WalletProviderInfo | null;
  walletAddress: string;
  walletChainId: number | null;
  walletClient: ChainTicketClient | null;
  userRoles: UserRoles;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
}

function readStoredEmbeddedWalletToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(EMBEDDED_WALLET_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeEmbeddedWalletToken(token: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (token) {
      window.localStorage.setItem(EMBEDDED_WALLET_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(EMBEDDED_WALLET_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures and keep the in-memory session alive.
  }
}

function buildEmbeddedWalletProvider(runtimeConfig: RuntimeConfig): WalletProviderInfo | null {
  if (!runtimeConfig.embeddedWalletEnabled) {
    return null;
  }

  return {
    id: "embedded-beta",
    name: runtimeConfig.embeddedWalletLabel,
    kind: "embedded",
    isMetaMask: false,
    description: "Email login with platform-sponsored gas for fan flows.",
    sponsoredActions: ["mint_standard", "mint_fanpass", "claim_insurance", "redeem_perk", "redeem_merch"],
  };
}

function providerForEmbeddedSession(session: EmbeddedWalletSession): WalletProviderInfo {
  return {
    id: session.providerId,
    name: session.providerLabel,
    kind: "embedded",
    isMetaMask: false,
    description: "Email login with platform-sponsored gas for fan flows.",
    sponsoredActions: [...session.sponsoredActions],
  };
}

export function useWalletSession({
  contractConfig,
  runtimeConfig,
  hasValidConfig,
  createClient,
  createSponsoredClient,
  walletConnector,
  readClient,
  bffClient,
  clearMessages,
  setErrorMessage,
  setStatusMessage,
}: WalletSessionArgs): WalletSessionResult {
  const embeddedWalletEnabled = runtimeConfig.embeddedWalletEnabled && Boolean(bffClient);
  const embeddedProvider = useMemo(
    () => buildEmbeddedWalletProvider(runtimeConfig),
    [runtimeConfig],
  );

  const [walletProviders, setWalletProviders] = useState<WalletProviderInfo[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [connectedProvider, setConnectedProvider] = useState<WalletProviderInfo | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [walletClient, setWalletClient] = useState<ChainTicketClient | null>(null);
  const [userRoles, setUserRoles] = useState<UserRoles>(EMPTY_ROLES);
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletSigner, setWalletSigner] = useState<Signer | null>(null);
  const [walletReadProvider, setWalletReadProvider] = useState<Provider | null>(null);
  const [walletMode, setWalletMode] = useState<"injected" | "embedded" | null>(null);
  const [embeddedWalletEmail, setEmbeddedWalletEmail] = useState("");
  const [embeddedWalletCode, setEmbeddedWalletCode] = useState("");
  const [embeddedWalletSession, setEmbeddedWalletSession] = useState<EmbeddedWalletSession | null>(null);
  const [embeddedWalletDevCode, setEmbeddedWalletDevCode] = useState<string | null>(null);
  const [isEmbeddedWalletBusy, setIsEmbeddedWalletBusy] = useState(false);
  const walletClientRef = useRef<ChainTicketClient | null>(null);

  const selectedProvider = useMemo(
    () =>
      walletProviders.find((provider) => provider.id === selectedProviderId) ??
      walletProviders[0] ??
      null,
    [selectedProviderId, walletProviders],
  );

  const clearWalletState = useCallback(() => {
    setWalletAddress("");
    setWalletChainId(null);
    setWalletClient(null);
    walletClientRef.current = null;
    setWalletSigner(null);
    setWalletReadProvider(null);
    setConnectedProvider(null);
    setUserRoles(EMPTY_ROLES);
    setWalletMode(null);
    setEmbeddedWalletSession(null);
    setEmbeddedWalletDevCode(null);
  }, []);

  const loadUserRoles = useCallback(
    async (address: string, preferredClient: ChainTicketClient | null = null) => {
      const roleClient = preferredClient?.getUserRoles
        ? preferredClient
        : walletClientRef.current?.getUserRoles
          ? walletClientRef.current
          : readClient?.getUserRoles
            ? readClient
            : null;

      if (!roleClient?.getUserRoles) {
        setUserRoles(EMPTY_ROLES);
        return;
      }

      try {
        const roles = await roleClient.getUserRoles(address);
        setUserRoles(roles);
      } catch {
        setUserRoles(EMPTY_ROLES);
      }
    },
    [readClient],
  );

  useEffect(() => {
    if (!readClient) {
      return;
    }

    let isCancelled = false;

    void readClient
      .discoverWallets()
      .then((providers) => {
        if (isCancelled) {
          return;
        }

        const nextProviders = embeddedProvider
          ? [embeddedProvider, ...providers.filter((provider) => provider.id !== embeddedProvider.id)]
          : providers;

        setWalletProviders(nextProviders);
        setSelectedProviderId((current) => {
          if (current && nextProviders.some((provider) => provider.id === current)) {
            return current;
          }
          return nextProviders[0]?.id ?? "";
        });
      })
      .catch(() => {
        if (!isCancelled) {
          setWalletProviders(embeddedProvider ? [embeddedProvider] : []);
          setSelectedProviderId(embeddedProvider?.id ?? "");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [embeddedProvider, readClient]);

  useEffect(() => {
    if (!embeddedWalletEnabled || !bffClient || !embeddedProvider) {
      return;
    }

    const storedToken = readStoredEmbeddedWalletToken();
    if (!storedToken) {
      return;
    }

    let cancelled = false;
    setIsEmbeddedWalletBusy(true);

    void bffClient
      .getEmbeddedWalletSession(storedToken)
      .then((session) => {
        if (cancelled) {
          return;
        }

        if (!session) {
          storeEmbeddedWalletToken(null);
          return;
        }

        setEmbeddedWalletSession(session);
        setEmbeddedWalletEmail(session.email);
        setWalletAddress(session.walletAddress);
        setWalletChainId(contractConfig.chainId);
        setWalletMode("embedded");
        setConnectedProvider(providerForEmbeddedSession(session));
        setWalletReadProvider(new JsonRpcProvider(contractConfig.rpcUrl, contractConfig.chainId));
        setStatusMessage(`Connected ${session.providerLabel} on chain ${contractConfig.chainName}.`);
      })
      .catch(() => {
        if (!cancelled) {
          storeEmbeddedWalletToken(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsEmbeddedWalletBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    bffClient,
    contractConfig.chainId,
    contractConfig.chainName,
    contractConfig.rpcUrl,
    embeddedProvider,
    embeddedWalletEnabled,
    setStatusMessage,
  ]);

  useEffect(() => {
    if (!connectedProvider || connectedProvider.kind !== "injected") {
      return;
    }

    const unsubscribe = subscribeWalletLifecycle(connectedProvider.provider, {
      onAccountsChanged: (accounts) => {
        const first = accounts[0];
        if (!first) {
          clearWalletState();
          setStatusMessage("Wallet disconnected.");
          return;
        }

        setWalletAddress(first);
        setStatusMessage("Wallet account changed.");
        void loadUserRoles(first);
      },
      onChainChanged: (chainId) => {
        setWalletChainId(chainId);
        if (chainId !== contractConfig.chainId) {
          setErrorMessage(`Wrong network detected (${chainId}). Switch to ${contractConfig.chainName}.`);
        } else {
          setErrorMessage("");
          setStatusMessage(`Network switched to ${contractConfig.chainName}.`);
        }
      },
      onDisconnect: () => {
        clearWalletState();
        setStatusMessage("Wallet disconnected.");
      },
    });

    return () => {
      unsubscribe();
    };
  }, [
    clearWalletState,
    connectedProvider,
    contractConfig.chainId,
    contractConfig.chainName,
    loadUserRoles,
    setErrorMessage,
    setStatusMessage,
  ]);

  useEffect(() => {
    if (!walletAddress) {
      return;
    }

    let nextWalletClient: ChainTicketClient | null = null;

    if (walletMode === "embedded") {
      if (!embeddedWalletSession || !connectedProvider || !bffClient) {
        return;
      }

      nextWalletClient = createSponsoredClient(contractConfig, {
        address: embeddedWalletSession.walletAddress,
        sessionToken: embeddedWalletSession.sessionToken,
        bffClient,
        providerInfo: connectedProvider,
      });
    } else {
      if (!walletSigner) {
        return;
      }

      nextWalletClient = createClient(contractConfig, {
        signer: walletSigner,
        readProvider: walletReadProvider ?? undefined,
      });
    }

    walletClientRef.current = nextWalletClient;
    setWalletClient(nextWalletClient);
    void loadUserRoles(walletAddress, nextWalletClient);
  }, [
    bffClient,
    connectedProvider,
    contractConfig,
    createClient,
    createSponsoredClient,
    embeddedWalletSession,
    loadUserRoles,
    walletAddress,
    walletMode,
    walletReadProvider,
    walletSigner,
  ]);

  const requestEmbeddedWalletCode = useCallback(async () => {
    if (!embeddedWalletEnabled || !bffClient) {
      setErrorMessage("Embedded wallet beta is unavailable. Check the BFF configuration.");
      return;
    }

    const normalizedEmail = embeddedWalletEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setErrorMessage("Enter an email address to start the embedded wallet flow.");
      return;
    }

    setIsEmbeddedWalletBusy(true);
    clearMessages();

    try {
      const challenge = await bffClient.requestEmbeddedWalletCode(normalizedEmail);
      setEmbeddedWalletEmail(challenge.email);
      setEmbeddedWalletDevCode(challenge.devCode);
      setSelectedProviderId(challenge.provider.id);
      setStatusMessage(
        challenge.devCode
          ? `Verification code ready for ${challenge.email}: ${challenge.devCode}`
          : `Verification code issued for ${challenge.email}. Enter it to connect your embedded wallet.`,
      );
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    } finally {
      setIsEmbeddedWalletBusy(false);
    }
  }, [
    bffClient,
    clearMessages,
    embeddedWalletEmail,
    embeddedWalletEnabled,
    setErrorMessage,
    setStatusMessage,
  ]);

  const verifyEmbeddedWalletCode = useCallback(async () => {
    if (!embeddedWalletEnabled || !bffClient) {
      setErrorMessage("Embedded wallet beta is unavailable. Check the BFF configuration.");
      return;
    }

    const normalizedEmail = embeddedWalletEmail.trim().toLowerCase();
    const verificationCode = embeddedWalletCode.trim();
    if (!normalizedEmail || !verificationCode) {
      setErrorMessage("Enter both e-mail and verification code to connect the embedded wallet.");
      return;
    }

    setIsConnecting(true);
    setIsEmbeddedWalletBusy(true);
    clearMessages();

    try {
      const session = await bffClient.verifyEmbeddedWalletCode(normalizedEmail, verificationCode);
      storeEmbeddedWalletToken(session.sessionToken);
      setEmbeddedWalletSession(session);
      setEmbeddedWalletEmail(session.email);
      setEmbeddedWalletCode("");
      setWalletAddress(session.walletAddress);
      setWalletChainId(contractConfig.chainId);
      setWalletMode("embedded");
      setWalletSigner(null);
      setWalletReadProvider(new JsonRpcProvider(contractConfig.rpcUrl, contractConfig.chainId));
      setConnectedProvider(providerForEmbeddedSession(session));
      setStatusMessage(`Connected ${session.providerLabel} on chain ${contractConfig.chainName}.`);
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    } finally {
      setIsConnecting(false);
      setIsEmbeddedWalletBusy(false);
    }
  }, [
    bffClient,
    clearMessages,
    contractConfig.chainId,
    contractConfig.chainName,
    contractConfig.rpcUrl,
    embeddedWalletCode,
    embeddedWalletEmail,
    embeddedWalletEnabled,
    setErrorMessage,
    setStatusMessage,
  ]);

  const disconnectWallet = useCallback(() => {
    storeEmbeddedWalletToken(null);
    clearWalletState();
    setEmbeddedWalletCode("");
    setStatusMessage("Wallet disconnected.");
  }, [clearWalletState, setStatusMessage]);

  const connectWallet = useCallback(async () => {
    if (!hasValidConfig) {
      setErrorMessage("Set valid frontend VITE_* variables before connecting wallet.");
      return;
    }

    if (selectedProvider?.kind === "embedded") {
      if (embeddedWalletSession) {
        setWalletAddress(embeddedWalletSession.walletAddress);
        setWalletChainId(contractConfig.chainId);
        setWalletMode("embedded");
        setConnectedProvider(providerForEmbeddedSession(embeddedWalletSession));
        setStatusMessage(
          `Connected ${embeddedWalletSession.providerLabel} on chain ${contractConfig.chainName}.`,
        );
        return;
      }

      if (embeddedWalletCode.trim().length > 0) {
        await verifyEmbeddedWalletCode();
        return;
      }

      await requestEmbeddedWalletCode();
      return;
    }

    setIsConnecting(true);
    clearMessages();

    try {
      const connected = await walletConnector(contractConfig, selectedProvider ?? undefined);
      setWalletAddress(connected.address);
      setWalletChainId(connected.chainId);
      setConnectedProvider(connected.providerInfo);
      setWalletMode("injected");
      setWalletSigner(connected.signer as Signer);
      setWalletReadProvider(connected.provider);
      setStatusMessage(`Connected ${connected.providerInfo.name} on chain ${connected.chainId}.`);
    } catch (error) {
      setErrorMessage(mapEthersError(error));
    } finally {
      setIsConnecting(false);
    }
  }, [
    clearMessages,
    contractConfig,
    embeddedWalletCode,
    embeddedWalletSession,
    hasValidConfig,
    requestEmbeddedWalletCode,
    selectedProvider,
    setErrorMessage,
    setStatusMessage,
    verifyEmbeddedWalletCode,
    walletConnector,
  ]);

  return {
    walletProviders,
    selectedProviderId,
    setSelectedProviderId,
    embeddedWalletEnabled,
    embeddedWalletEmail,
    setEmbeddedWalletEmail,
    embeddedWalletCode,
    setEmbeddedWalletCode,
    embeddedWalletSession,
    embeddedWalletDevCode,
    isEmbeddedWalletBusy,
    requestEmbeddedWalletCode,
    verifyEmbeddedWalletCode,
    connectedProvider,
    walletAddress,
    walletChainId,
    walletClient,
    userRoles,
    isConnecting,
    connectWallet,
    disconnectWallet,
  };
}
