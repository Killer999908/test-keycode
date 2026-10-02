import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ServicesGrid from "@/components/ServicesGrid";
import CameraOrbitSection from "@/components/CameraOrbitSection";
import Sections from "@/components/Sections";
import Works from "@/components/Works";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="relative">
      <Navbar />
      <Hero />
      <ServicesGrid />
      <CameraOrbitSection />
      <Works />
      <Sections />
      <Footer />
    </main>
  );
}
