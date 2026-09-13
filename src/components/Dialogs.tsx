import { useEffect, useRef, useState, type FormEvent } from "react";
import { useDocumentStore } from "../state/documentStore";
import { Icon } from "./Icon";

export function PasswordDialog() {
  const fileName = useDocumentStore((s) => s.fileName);
  const passwordError = useDocumentStore((s) => s.passwordError);
  const { submitPassword, cancelPassword } = useDocumentStore.getState();
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (passwordError) inputRef.current?.select();
  }, [passwordError]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) void submitPassword(password);
  };

  return (
    <div className="modal-backdrop">
      <form className="modal" role="dialog" aria-labelledby="pw-title" onSubmit={submit}>
        <div className="modal-icon">
          <Icon name="lock" size={22} />
        </div>
        <h2 id="pw-title">Enter PDF Password</h2>
        <p className="modal-text">“{fileName}” is protected. The password is kept in memory for this session only.</p>
        <input
          ref={inputRef}
          type="password"
          className={`text-input ${passwordError ? "invalid" : ""}`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!passwordError}
          autoComplete="off"
        />
        {passwordError && <p className="field-error">{passwordError}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={cancelPassword}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!password}>
            Open
          </button>
        </div>
      </form>
    </div>
  );
}

export function ErrorDialog() {
  const error = useDocumentStore((s) => s.error);
  const dismissError = useDocumentStore((s) => s.dismissError);
  if (!error) return null;

  const title =
    error.kind === "corrupt"
      ? "Cannot Open PDF"
      : error.kind === "unsupported"
        ? "Unsupported PDF"
        : error.kind === "read-failed"
          ? "Cannot Read File"
          : "Something Went Wrong";

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-labelledby="err-title">
        <h2 id="err-title">{title}</h2>
        <p className="modal-text">{error.message}</p>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={dismissError} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
