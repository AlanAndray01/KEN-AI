import { LegalPage, LegalSection } from "@/pages/LegalPage";

export function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="28 August 2026">
      <p>
        These terms cover your use of Ken AI. By creating an account you agree to them. If you do not
        agree, please do not use the service.
      </p>

      <LegalSection heading="What Ken AI is">
        <p>
          Ken AI is a conversational assistant. You send messages, and an AI model generates replies.
          It is a general-purpose tool for everyday work, explanation, and problem solving.
        </p>
      </LegalSection>

      <LegalSection heading="Answers can be wrong">
        <p>
          This is the most important thing on this page. AI models make mistakes, including confident
          ones. Ken AI can state something false, miss context, or misread a question.
        </p>
        <p>
          Do not rely on it for medical, legal, or financial decisions. Check anything that matters
          against a source you trust before acting on it. You are responsible for what you do with
          its output.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          Keep your password to yourself and use an email address you control. You are responsible
          for activity on your account. Tell us at support@ken-ai.tech if you think someone else has
          access to it.
        </p>
        <p>One person, one account. Do not share an account or resell access to the service.</p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to use Ken AI to:</p>
        <ul>
          <li>break the law, or help anyone else do so;</li>
          <li>create malware, or attack any system or network;</li>
          <li>harass, threaten, defame, or impersonate anyone;</li>
          <li>generate sexual content involving minors, or content that incites violence;</li>
          <li>submit other people's personal information without their consent;</li>
          <li>
            automate, scrape, or overload the service, or work around rate limits and access
            controls.
          </li>
        </ul>
        <p>Accounts that do these things may be suspended or removed without notice.</p>
      </LegalSection>

      <LegalSection heading="Who owns what">
        <p>
          You keep ownership of what you write. We store it only to operate the service — to show you
          your history and to generate replies.
        </p>
        <p>
          You are free to use the replies Ken AI produces, including commercially. Note that AI
          output is not always original and may resemble text produced for other people, so check
          before relying on anything as uniquely yours.
        </p>
        <p>The Ken AI name, design, and software remain ours.</p>
      </LegalSection>

      <LegalSection heading="Availability">
        <p>
          Ken AI is provided as-is, with no guarantee of uptime. It runs on free and low-cost
          infrastructure, and it depends on third-party AI providers. It may be slow, unavailable, or
          discontinued. Keep your own copy of anything you cannot afford to lose.
        </p>
      </LegalSection>

      <LegalSection heading="Ending your use">
        <p>
          You can delete your account at any time from Settings → Account. That removes your data
          permanently and cannot be undone.
        </p>
        <p>
          We may suspend or close an account that breaks these terms, or that puts the service or its
          users at risk.
        </p>
      </LegalSection>

      <LegalSection heading="Liability">
        <p>
          To the extent the law allows, Ken AI and its operator are not liable for lost data, lost
          profits, or any indirect damages arising from your use of the service. Some jurisdictions
          do not permit these limits, in which case they apply only as far as the law allows.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          These terms may change. The date at the top of this page shows the current version, and
          continuing to use Ken AI after a change means you accept it.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about these terms: support@ken-ai.tech</p>
      </LegalSection>
    </LegalPage>
  );
}
