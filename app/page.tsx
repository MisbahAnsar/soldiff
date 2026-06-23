import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import DemoSection from "./components/DemoSection";
import HowItWorksSection from "./components/HowItWorksSection";
import RulesSection from "./components/RulesSection";
import IntegrationsSection from "./components/IntegrationsSection";
import Footer from "./components/Footer";

export default function Page() {
  return (
    <>
      <Navbar />
      <main style={{ paddingTop: 64 }}>
        <Hero />

        <DemoSection />

        <div className="divider" />

        <HowItWorksSection />

        <div className="divider" />

        <RulesSection />

        <div className="divider" />

        <IntegrationsSection />
      </main>
      <Footer />
    </>
  );
}
