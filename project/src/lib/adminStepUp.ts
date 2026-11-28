let activeHandler: (() => Promise<void>) | null = null;

export function setAdminStepUpHandler(handler: (() => Promise<void>) | null) {
  activeHandler = handler;
}

export function requestAdminStepUp(): Promise<void> {
  if (!activeHandler) {
    return Promise.reject(new Error('Fresh authenticator verification is required. Refresh MatMove Admin and try again.'));
  }
  return activeHandler();
}
