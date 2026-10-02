'use client';

import dynamic from "next/dynamic";

// ssr: false must live in a client component; Universe uses `document` at render scope.
const OsRoot = dynamic(() => import("./OsRoot"), { ssr: false });

export default function OsClient() {
  return <OsRoot />;
}
