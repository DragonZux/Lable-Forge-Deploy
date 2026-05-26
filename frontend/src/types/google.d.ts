export {};

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            ux_mode?: "popup" | "redirect";
            login_uri?: string;
            locale?: string;
            auto_select?: boolean;
            itp_support?: boolean;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              shape?: "rectangular" | "pill" | "circle" | "square";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              locale?: string;
              width?: number;
            }
          ) => void;
        };
      };
    };
  }
}
