export type LiveKitTokenRequestState = {
  routeSessionId?: string;
  loadedSessionId?: string;
  candidateName?: string;
  liveKitConnected: boolean;
  tokenRequestAttempted: boolean;
};

export function shouldRequestLiveKitToken(state: LiveKitTokenRequestState): boolean {
  return Boolean(
    state.routeSessionId &&
      state.loadedSessionId &&
      state.routeSessionId === state.loadedSessionId &&
      state.candidateName?.trim() &&
      !state.liveKitConnected &&
      !state.tokenRequestAttempted
  );
}
