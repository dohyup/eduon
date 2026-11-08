"use client";
import { useRef, useId } from "react";
import { trapDialogFocus } from "./focus";
export function DemoDialog({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  return (
    <>
      <button className="button" onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        onKeyDown={trapDialogFocus}
        ref={ref}
        aria-labelledby={id}
        onClick={(e) => {
          if (e.target === e.currentTarget) ref.current?.close();
        }}
      >
        <div className="dialog-inner">
          <span className="eyebrow">EDUON PROTOTYPE</span>
          <h2 id={id}>{title}</h2>
          {children}
          <form method="dialog">
            <button className="button secondary">닫기</button>
          </form>
        </div>
      </dialog>
    </>
  );
}
