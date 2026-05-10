import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Services from "@/components/Services";
import FleetSection from "@/components/FleetSection";
import BookingSection from "@/components/BookingSection";
import WhyChooseUs from "@/components/WhyChooseUs";
import Testimonials from "@/components/Testimonials";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-[#0A0A0A]" data-testid="landing-page">
      <Navbar />
      <Hero />
      <Services />
      <FleetSection />
      <BookingSection />
      <WhyChooseUs />
      <Testimonials />
      <Footer />
      <WhatsAppButton />
    </div>
  );
};

export default LandingPage;
