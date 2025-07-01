const express = require("express");
const app = express();

const stripe = require("stripe")(
  // This is your test secret API key.
  'sk_test_51Rehl9Gb9LLbQg43z3qWMdsut7xJ51s7ykx8XkzMRvsqQg51dDJT4yEKwH9aihwZPidtwc9JVufeaGEMygWyzlqN00r2UMGK2I',
  {
    apiVersion: "2023-10-16",
  }
);

app.use(express.static("dist"));
app.use(express.json());

app.post("/account_session", async (req, res) => {
  try {
    const { account } = req.body;

    const accountSession = await stripe.accountSessions.create({
      account: account,
      components: {
        account_onboarding: { enabled: true },
        account_management: {enabled: true},
        notification_banner: {enabled: true},
      },
    });

    res.json({
      client_secret: accountSession.client_secret,
    });
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account session",
      error
    );
    res.status(500);
    res.send({ error: error.message });
  }
});

app.post("/account", async (req, res) => {
  try {
    const account = await stripe.accounts.create({
      controller: {
        stripe_dashboard: {
          type: "none",
        },
      },
      capabilities: {
        card_payments: {requested: true},
        transfers: {requested: true}
      },
      country: "US",
    });

    res.json({
      account: account.id,
    });
  } catch (error) {
    console.error(
      "An error occurred when calling the Stripe API to create an account",
      error
    );
    res.status(500);
    res.send({ error: error.message });
  }
});

app.get("/*", (_req, res) => {
  res.sendFile(__dirname + "/dist/index.html");
});

app.listen(4242, () => console.log("Node server listening on port 4242! Visit http://localhost:4242 in your browser."));