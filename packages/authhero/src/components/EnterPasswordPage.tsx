import type { FC } from "hono/jsx";
import Layout from "./Layout";
import Button from "./Button";
import i18next from "i18next";
import ErrorMessage from "./ErrorMessage";
import Icon from "./Icon";
import FormComponent from "./Form";
import { GoBack } from "./GoBack";
import { LegacyClient, Theme, Branding } from "@authhero/adapter-interfaces";
import PasswordInput from "./PasswordInput";
import { html } from "hono/html";

type Props = {
  error?: string;
  theme: Theme | null;
  branding: Branding | null;
  email: string;
  state: string;
  client: LegacyClient;
};

const EnterPasswordPage: FC<Props> = (params) => {
  const { error, theme, branding, email, state, client } = params;

  const loginLinkParams = new URLSearchParams({
    state,
  });

  return (
    <Layout
      title={i18next.t("enter_password")}
      theme={theme}
      branding={branding}
      client={client}
    >
      <div className="mb-4 text-lg font-medium sm:text-2xl">
        {i18next.t("enter_password")}
      </div>
      <div className="mb-6 text-gray-300">
        {i18next.t("enter_password_description")}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <FormComponent className="mb-7">
          <input
            type="text"
            name="username"
            placeholder={i18next.t("email_placeholder")}
            className="mb-2 w-full rounded-lg bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
            value={email}
          />
          <PasswordInput name="password" />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button className="sm:mt-4 !text-base">
            <span>{i18next.t("login")}</span>
            <Icon className="text-xs" name="arrow-right" />
          </Button>
        </FormComponent>
        <a
          href={`/u/forgot-password?${loginLinkParams.toString()}`}
          className="text-primary hover:underline mb-4"
        >
          {i18next.t("forgot_password_link")}
        </a>
        <div className="text-center mb-12">
          <div className="relative mb-5 block text-center text-gray-300 dark:text-gray-300">
            <div className="absolute left-0 right-0 top-1/2 border-b border-gray-200 dark:border-gray-600" />
            <div className="relative inline-block bg-white px-2 dark:bg-gray-800">
              {i18next.t("or")}
            </div>
          </div>
          <form
            method="post"
            action={`/u/login/identifier?${loginLinkParams.toString()}`}
          >
            <input type="hidden" name="login_selection" value="code" />
            <input type="hidden" name="username" value={email} />
            <Button variant="secondary" className="block">
              {i18next.t("enter_a_code_btn")}
            </Button>
          </form>
        </div>
        <GoBack state={state} />
      </div>
      {html`
        <script>
          // Show password toggle
          var passwordInputs = document.querySelectorAll(".password-input");
          passwordInputs.forEach(function (wrapper) {
            var showPasswordBtn = wrapper.querySelector(
              ".show-password-toggle-show",
            );
            var hidePasswordBtn = wrapper.querySelector(
              ".show-password-toggle-hide",
            );
            var passwordField = wrapper.querySelector("input[type=password]");
            showPasswordBtn.addEventListener("click", function () {
              passwordField.type = "text";
              showPasswordBtn.classList.add("!hidden");
              hidePasswordBtn.classList.remove("!hidden");
            });
            hidePasswordBtn.addEventListener("click", function () {
              passwordField.type = "password";
              hidePasswordBtn.classList.add("!hidden");
              showPasswordBtn.classList.remove("!hidden");
            });
          });
        </script>
      `}
    </Layout>
  );
};

export default EnterPasswordPage;
