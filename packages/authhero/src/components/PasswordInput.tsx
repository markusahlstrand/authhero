import i18next from "i18next";
import IconEye from "./IconEye";
import IconEyeSlash from "./IconEyeSlash";

type Props = {
  name: string;
  placeholder?: string;
};

const PasswordInput = ({
  name,
  placeholder = i18next.t("password"),
}: Props) => {
  return (
    <div className="password-input relative mb-2" data-password-toggle>
      <input
        type="password"
        name={name}
        placeholder={placeholder}
        className="w-full rounded-lg bg-gray-100 px-4 py-5 text-base placeholder:text-gray-300 dark:bg-gray-600 md:text-base"
        required
      />
      <button
        type="button"
        aria-label={i18next.t("show_password")}
        title={i18next.t("show_password")}
        className="absolute right-0 top-0 w-10 h-full rounded-r-lg text-gray-400 column hover:bg-black/5"
        data-password-toggle-btn
      >
        <IconEye data-show-icon />
        <IconEyeSlash data-hide-icon className="hidden" />
      </button>
    </div>
  );
};

export default PasswordInput;
