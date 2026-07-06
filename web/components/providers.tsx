"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import type { AuthLocalization } from "@daveyplate/better-auth-ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

// Rioplatense Spanish for every better-auth-ui view we actually render:
// sign-in, forgot-password, reset-password, sign-out, and the account/security
// settings. (Sign-up is our own custom page — see app/auth/sign-up/page.tsx.)
// Keys not overridden here fall back to the package's English defaults.
const es: Partial<AuthLocalization> = {
  // sign in
  SIGN_IN: "Iniciá sesión",
  SIGN_IN_ACTION: "Ingresar",
  SIGN_IN_DESCRIPTION: "Ingresá tu email para entrar a tu cuenta",
  EMAIL: "Email",
  EMAIL_PLACEHOLDER: "vos@ejemplo.com",
  EMAIL_DESCRIPTION: "Ingresá el email con el que iniciás sesión.",
  EMAIL_INSTRUCTIONS: "Ingresá un email válido.",
  PASSWORD: "Contraseña",
  PASSWORD_PLACEHOLDER: "Contraseña",
  REMEMBER_ME: "Recordarme",
  // links between views
  DONT_HAVE_AN_ACCOUNT: "¿No tenés cuenta?",
  ALREADY_HAVE_AN_ACCOUNT: "¿Ya tenés cuenta?",
  SIGN_UP: "Crear cuenta",
  SIGN_UP_ACTION: "Crear cuenta",
  // forgot / reset password
  FORGOT_PASSWORD: "Olvidé mi contraseña",
  FORGOT_PASSWORD_ACTION: "Enviar enlace",
  FORGOT_PASSWORD_DESCRIPTION: "Ingresá tu email para restablecer la contraseña",
  FORGOT_PASSWORD_LINK: "¿Olvidaste tu contraseña?",
  FORGOT_PASSWORD_EMAIL: "Revisá tu email para el enlace de restablecimiento.",
  RESET_PASSWORD: "Restablecer contraseña",
  RESET_PASSWORD_ACTION: "Guardar contraseña",
  RESET_PASSWORD_DESCRIPTION: "Ingresá tu nueva contraseña",
  NEW_PASSWORD: "Nueva contraseña",
  NEW_PASSWORD_PLACEHOLDER: "Nueva contraseña",
  // account + security settings
  NAME: "Nombre",
  NAME_PLACEHOLDER: "Nombre",
  NAME_DESCRIPTION: "Ingresá tu nombre o el nombre de tu club.",
  NAME_INSTRUCTIONS: "Usá 32 caracteres como máximo.",
  ACCOUNT: "Cuenta",
  SECURITY: "Seguridad",
  SETTINGS: "Configuración",
  ACCOUNTS: "Cuentas",
  ACCOUNTS_DESCRIPTION: "Cambiá entre las cuentas con las que iniciaste sesión.",
  SESSIONS: "Sesiones",
  SESSIONS_DESCRIPTION: "Gestioná tus sesiones activas y revocá accesos.",
  CURRENT_SESSION: "Sesión actual",
  CHANGE_PASSWORD: "Cambiar contraseña",
  CHANGE_PASSWORD_DESCRIPTION: "Ingresá tu contraseña actual y una nueva.",
  CURRENT_PASSWORD: "Contraseña actual",
  CURRENT_PASSWORD_PLACEHOLDER: "Contraseña actual",
  SET_PASSWORD: "Definir contraseña",
  // sign out + generic actions
  SIGN_OUT: "Cerrar sesión",
  SAVE: "Guardar",
  CANCEL: "Cancelar",
  DELETE: "Eliminar",
  CONTINUE: "Continuar",
  GO_BACK: "Volver",
  REVOKE: "Revocar",
  // common validation / error strings surfaced by the forms
  UNEXPECTED_ERROR: "Ocurrió un error inesperado",
  INVALID_EMAIL: "Email inválido",
  INVALID_EMAIL_OR_PASSWORD: "Email o contraseña incorrectos",
  INVALID_PASSWORD: "Contraseña inválida",
  EMAIL_REQUIRED: "El email es obligatorio",
  PASSWORD_REQUIRED: "La contraseña es obligatoria",
  PASSWORD_TOO_SHORT: "La contraseña es muy corta",
  PASSWORD_TOO_LONG: "La contraseña es muy larga",
  EMAIL_IS_THE_SAME: "El email es el mismo",
  USER_ALREADY_EXISTS: "Ese email ya tiene cuenta",
  IS_REQUIRED: "es obligatorio",
  IS_INVALID: "es inválido",
};

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <AuthUIProvider
      authClient={authClient}
      navigate={router.push}
      replace={router.replace}
      onSessionChange={() => router.refresh()}
      Link={Link}
      // Single static post-auth target; app/post-auth reads the session and
      // routes by role (club → /dashboard, fan → /wallet). Wallet creation +
      // linking still happens on the destination via <EnsureWallet>.
      redirectTo="/post-auth"
      localization={es}
      // Account settings live at /account/*; only the display name is editable
      // (role is set once at signup and must not change; no avatar storage).
      account={{ basePath: "/account", fields: ["name"] }}
    >
      {children}
    </AuthUIProvider>
  );
}
