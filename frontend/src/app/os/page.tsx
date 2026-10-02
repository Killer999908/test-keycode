import type { Metadata } from "next";
import OsClient from "@/components/os/OsClient";
import "../os.css";

export const metadata: Metadata = {
  title: "KEYCODE OS — Autonomous Build Environment",
  description: "Describe any product. An autonomous agent team designs, builds, and deploys it live.",
};

export default function OsPage() {
  return <OsClient />;
}
