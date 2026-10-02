import Scene from "@/components/Scene";
import LoadingGate from "@/components/LoadingGate";
import LenisProvider from "@/components/LenisProvider";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Scene />
      <LoadingGate>
        <LenisProvider>{children}</LenisProvider>
      </LoadingGate>
    </>
  );
}
