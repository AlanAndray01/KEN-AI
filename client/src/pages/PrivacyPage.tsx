import { LegalPage, LegalSection } from "@/pages/LegalPage";

export function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="28 August 2026">
      <p>
        Ken AI is a conversational assistant operated from Pakistan. This page describes what the
        service stores, who it is shared with, and how to get it deleted. It is written to match what
        the software actually does.
      </p>

      <LegalSection heading="What we collect">
        <p>
          <strong className="text-fg">Account details.</strong> Your name, email address, and a
          password. Passwords are hashed with Argon2 and are never stored in a readable form. If you
          sign in with Google, we receive your email address, name, and profile picture from Google
          — nothing else, and never your Google password.
        </p>
        <p>
          <strong className="text-fg">Your conversations.</strong> The messages you send and the
          replies you receive are stored so your chat history is there when you return.
        </p>
        <p>
          <strong className="text-fg">Files you upload.</strong> Documents and images you attach to a
          conversation, kept so they remain available in that conversation.
        </p>
        <p>
          <strong className="text-fg">Settings and saved items.</strong> Preferences, saved memories,
          and any custom assistants you create.
        </p>
        <p>
          <strong className="text-fg">Technical records.</strong> Basic request logs used to keep the
          service running and to apply rate limits. We do not use advertising trackers, and we do not
          sell data to anyone.
        </p>
      </LegalSection>

      <LegalSection heading="Who your messages are sent to">
        <p>
          Ken AI does not run its own language model. To answer you, your message and the relevant
          part of the conversation are sent to an AI provider — currently{" "}
          <strong className="text-fg">Groq</strong> — which generates the reply and returns it. Treat
          anything you type as leaving our servers for that purpose.
        </p>
        <p>
          Other services we rely on: <strong className="text-fg">MongoDB Atlas</strong> stores your
          data, <strong className="text-fg">Resend</strong> sends verification and password-reset
          emails, and <strong className="text-fg">Render</strong> and{" "}
          <strong className="text-fg">Vercel</strong> host the application.
        </p>
      </LegalSection>

      <LegalSection heading="Please do not share sensitive information">
        <p>
          Do not send passwords, financial account numbers, national identity numbers, medical
          records, or anyone else's personal information in a conversation. Messages are stored and
          are processed by a third-party AI provider, so they are not the place for secrets.
        </p>
      </LegalSection>

      <LegalSection heading="How long we keep it">
        <p>
          Your account and conversations are kept until you delete them or close your account.
          Deleting a conversation removes it from the service. Closing your account removes your
          profile, conversations, messages, uploaded files, memories, and custom assistants.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          You can edit or delete individual conversations at any time, update your details in
          Settings, and delete your entire account from Settings → Account. Account deletion is
          permanent and is not reversible.
        </p>
        <p>
          To request a copy of your data, or if you have any question about this policy, email
          support@ken-ai.tech.
        </p>
      </LegalSection>

      <LegalSection heading="Security">
        <p>
          Traffic is encrypted with HTTPS. Passwords are hashed, session cookies are HttpOnly and
          cannot be read by scripts, and any AI provider keys you supply are encrypted before they
          are stored. No service can promise perfect security, but we do not store anything we do not
          need.
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Ken AI is not intended for children under 13. If you believe a child has created an
          account, email support@ken-ai.tech and we will remove it.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>
          If this policy changes in a way that affects you, the date at the top of this page will be
          updated. Continuing to use Ken AI after a change means you accept the revised policy.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
