// ── Privacy Policy & Terms of Service ─────────────────────────
// Public page (no auth required) for App Store compliance.

export const metadata = {
  title: "Privacy Policy & Terms of Service | VettdRE",
  description: "VettdRE privacy policy, data practices, and terms of service.",
};

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px 96px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#0F172A",
        lineHeight: 1.7,
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        Privacy Policy
      </h1>
      <p style={{ color: "#64748B", marginBottom: 40, fontSize: 14 }}>
        Last updated: April 1, 2026
      </p>

      <Section title="1. Who We Are">
        <p>
          VettdRE (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates
          the VettdRE mobile application and web platform at app.vettdre.com. We
          provide AI-powered tools for New York City real estate professionals,
          including property intelligence, CRM, deal management, and brokerage
          operations.
        </p>
      </Section>

      <Section title="2. Information We Collect">
        <p>
          <strong>Account information:</strong> When you create an account, we
          collect your name, email address, phone number, brokerage affiliation,
          and license number.
        </p>
        <p>
          <strong>Property data:</strong> When you use our building scout and
          market intelligence features, we access publicly available NYC Open
          Data records including PLUTO, ACRIS, HPD violations, DOB permits, and
          rent stabilization data.
        </p>
        <p>
          <strong>Photos and camera:</strong> If you use the building scout
          camera feature, we process photos solely to identify building addresses
          and retrieve property data. Photos are not stored on our servers after
          processing.
        </p>
        <p>
          <strong>Location data:</strong> If you grant location permission, we
          use your approximate location to identify nearby buildings. Location
          data is used in real-time and not stored.
        </p>
        <p>
          <strong>Usage data:</strong> We collect anonymized analytics about app
          usage to improve our services, including screens visited and features
          used.
        </p>
      </Section>

      <Section title="3. How We Use Your Information">
        <p>We use your information to:</p>
        <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
          <li>Provide and maintain the VettdRE platform</li>
          <li>Authenticate your identity and secure your account</li>
          <li>Deliver property intelligence and market data</li>
          <li>Manage your contacts, deals, and pipeline</li>
          <li>Send notifications about tasks, showings, and deal updates</li>
          <li>Process payments for subscription plans</li>
          <li>Improve our AI models and product features</li>
        </ul>
      </Section>

      <Section title="4. Information Sharing">
        <p>
          We do not sell your personal information. We share data only in these
          limited circumstances:
        </p>
        <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
          <li>
            <strong>Service providers:</strong> We use Supabase (database and
            authentication), Stripe (payment processing), Twilio
            (communications), and Anthropic (AI processing) to operate our
            platform. These providers access only the data needed to perform
            their services.
          </li>
          <li>
            <strong>Within your organization:</strong> If you are part of a
            brokerage team, your team administrator may have access to your
            activity and deal data within the platform.
          </li>
          <li>
            <strong>Legal requirements:</strong> We may disclose information if
            required by law, subpoena, or legal process.
          </li>
        </ul>
      </Section>

      <Section title="5. Data Security">
        <p>
          We use industry-standard security measures including encrypted
          connections (TLS/HTTPS), encrypted token storage (AES-256-GCM),
          role-based access controls, and secure authentication via Supabase
          Auth. Biometric authentication (Face ID / Touch ID) is available for
          additional account protection on mobile devices.
        </p>
      </Section>

      <Section title="6. Data Retention">
        <p>
          We retain your account data for as long as your account is active. If
          you delete your account, we will remove your personal information
          within 30 days, except where we are required to retain it for legal or
          compliance purposes.
        </p>
      </Section>

      <Section title="7. Your Rights">
        <p>You have the right to:</p>
        <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your account and data</li>
          <li>Export your data in a portable format</li>
          <li>Opt out of non-essential communications</li>
        </ul>
        <p>
          To exercise these rights, contact us at{" "}
          <a href="mailto:privacy@vettdre.com" style={{ color: "#2563EB" }}>
            privacy@vettdre.com
          </a>
          .
        </p>
      </Section>

      <Section title="8. Push Notifications">
        <p>
          We may send push notifications about deal updates, task reminders,
          showing schedules, and other time-sensitive information. You can
          disable push notifications at any time through your device settings or
          within the app.
        </p>
      </Section>

      <Section title="9. Over-the-Air Updates">
        <p>
          Our mobile app may receive over-the-air updates via Expo to deliver bug
          fixes and improvements without requiring a new download from the App
          Store. These updates do not change the app&apos;s core functionality or
          data collection practices.
        </p>
      </Section>

      <Section title="10. Children&rsquo;s Privacy">
        <p>
          VettdRE is designed for real estate professionals and is not intended
          for use by anyone under the age of 18. We do not knowingly collect
          information from children.
        </p>
      </Section>

      <Section title="11. Changes to This Policy">
        <p>
          We may update this privacy policy from time to time. We will notify you
          of any material changes by posting the updated policy on this page and
          updating the &quot;Last updated&quot; date.
        </p>
      </Section>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid #E2E8F0",
          margin: "48px 0",
        }}
      />

      <h1
        style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}
        id="terms"
      >
        Terms of Service
      </h1>
      <p style={{ color: "#64748B", marginBottom: 40, fontSize: 14 }}>
        Last updated: April 1, 2026
      </p>

      <Section title="1. Acceptance of Terms">
        <p>
          By accessing or using VettdRE, you agree to be bound by these Terms of
          Service. If you do not agree, do not use the platform.
        </p>
      </Section>

      <Section title="2. Description of Service">
        <p>
          VettdRE provides AI-powered real estate tools including property
          intelligence, CRM, deal management, brokerage operations, and an AI
          leasing agent. The platform integrates public NYC data sources and
          third-party APIs to deliver property insights.
        </p>
      </Section>

      <Section title="3. Account Responsibilities">
        <p>
          You are responsible for maintaining the confidentiality of your account
          credentials and for all activity that occurs under your account. You
          agree to provide accurate and complete information when creating your
          account.
        </p>
      </Section>

      <Section title="4. Acceptable Use">
        <p>You agree not to:</p>
        <ul style={{ paddingLeft: 20, margin: "8px 0" }}>
          <li>Use VettdRE for any unlawful purpose</li>
          <li>
            Scrape, reverse-engineer, or attempt to extract the underlying code
          </li>
          <li>
            Share your account credentials or allow unauthorized access
          </li>
          <li>Interfere with or disrupt the platform&apos;s infrastructure</li>
          <li>
            Use the platform to harass, spam, or deceive other users
          </li>
        </ul>
      </Section>

      <Section title="5. Subscription & Billing">
        <p>
          Paid features are billed through Stripe on a monthly or annual basis.
          You may manage your subscription and cancel at any time through the
          billing settings. Refunds are handled in accordance with our refund
          policy.
        </p>
      </Section>

      <Section title="6. Data Accuracy">
        <p>
          Property data provided through VettdRE is sourced from public records
          and third-party APIs. While we strive for accuracy, we do not guarantee
          the completeness or correctness of any property information. Users
          should independently verify critical data before making business
          decisions.
        </p>
      </Section>

      <Section title="7. AI-Generated Content">
        <p>
          VettdRE uses artificial intelligence to generate property analyses,
          ownership insights, and other content. AI-generated content is provided
          for informational purposes only and should not be relied upon as legal,
          financial, or professional advice.
        </p>
      </Section>

      <Section title="8. Intellectual Property">
        <p>
          The VettdRE platform, including its design, code, and AI models, is
          owned by VettdRE. Your use of the platform does not grant you any
          ownership rights. Content you create within VettdRE (contacts, deals,
          notes) remains yours.
        </p>
      </Section>

      <Section title="9. Limitation of Liability">
        <p>
          VettdRE is provided &quot;as is&quot; without warranties of any kind.
          We are not liable for any indirect, incidental, or consequential
          damages arising from your use of the platform, including but not
          limited to lost profits, data loss, or business interruption.
        </p>
      </Section>

      <Section title="10. Termination">
        <p>
          We may suspend or terminate your account if you violate these terms.
          You may delete your account at any time. Upon termination, your right
          to use the platform ceases immediately.
        </p>
      </Section>

      <Section title="11. Governing Law">
        <p>
          These terms are governed by the laws of the State of New York. Any
          disputes shall be resolved in the courts located in New York County,
          New York.
        </p>
      </Section>

      <Section title="12. Contact Us">
        <p>
          For questions about these terms or our privacy practices, contact us
          at{" "}
          <a href="mailto:support@vettdre.com" style={{ color: "#2563EB" }}>
            support@vettdre.com
          </a>
          .
        </p>
      </Section>

      <footer
        style={{
          marginTop: 64,
          paddingTop: 24,
          borderTop: "1px solid #E2E8F0",
          color: "#94A3B8",
          fontSize: 13,
          textAlign: "center" as const,
        }}
      >
        &copy; {new Date().getFullYear()} VettdRE. All rights reserved.
      </footer>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 20,
          fontWeight: 600,
          marginBottom: 12,
          color: "#1E293B",
        }}
      >
        {title}
      </h2>
      <div style={{ color: "#475569", fontSize: 15 }}>{children}</div>
    </section>
  );
}
