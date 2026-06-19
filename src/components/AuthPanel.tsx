import type { FormEvent } from "react";
import { BrandLogo } from "./BrandLogo";

interface AuthPanelProps {
  email: string;
  password: string;
  error: string;
  loading: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AuthPanel({
  email,
  password,
  error,
  loading,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: AuthPanelProps) {
  return (
    <section className="auth-layout">
      <article className="panel auth-panel">
        <div className="auth-panel__copy">
          <div className="auth-panel__brand">
            <BrandLogo className="brand-logo brand-logo--login" />

            <div className="auth-panel__brand-copy">
              <p className="eyebrow">Acceso privado</p>
              <p className="auth-panel__lede">
                Ingresa con tu usuario para administrar alquileres, inquilinos y vencimientos del
                edificio desde una sola interfaz.
              </p>
            </div>
          </div>

          <div className="auth-panel__notes">
            <article>
              <strong>Acceso protegido</strong>
              <p>Solo los usuarios autorizados pueden entrar al panel administrativo.</p>
            </article>
            <article>
              <strong>Gestion centralizada</strong>
              <p>Todo el control de alquileres y pagos se administra desde este mismo lugar.</p>
            </article>
          </div>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <div>
            <p className="eyebrow">Ingreso</p>
            <h2>Entrar al panel</h2>
          </div>

          <label className="search-field auth-form__field">
            <span>Email</span>
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="admin@edificio.com"
              required
            />
          </label>

          <label className="search-field auth-form__field">
            <span>Contrasena</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Ingresa tu contrasena"
              required
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar al sistema"}
          </button>
        </form>
      </article>
    </section>
  );
}
