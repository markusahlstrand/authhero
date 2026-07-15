import type { FC, Child, PropsWithChildren } from "hono/jsx";
import { Theme, Branding } from "@authhero/adapter-interfaces";
import cn from "classnames";
import Card, {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import AppLogo from "./AppLogo";
import type { AuthFormStyles } from "./auth-form-styles";

type Props = PropsWithChildren<{
  styles: AuthFormStyles;
  theme?: Theme | null;
  branding?: Branding | null;
  title: Child;
  description: Child;
  className?: string;
}>;

/**
 * The shared page shell for the universal-login auth screens: the themed card,
 * optional logo, title, and description, with the form passed as children.
 */
const AuthCard: FC<Props> = ({
  styles,
  theme,
  branding,
  title,
  description,
  className,
  children,
}) => {
  return (
    <div className={cn("flex flex-col gap-6 w-full max-w-sm", className)}>
      <Card style={styles.cardStyle} className="border">
        <CardHeader>
          {styles.showLogo && (
            <div className={cn("mb-4", styles.logoAlignmentClass)}>
              <AppLogo theme={theme} branding={branding} />
            </div>
          )}
          <CardTitle style={styles.titleStyle}>{title}</CardTitle>
          <CardDescription style={styles.bodyStyle}>
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
};

export default AuthCard;
