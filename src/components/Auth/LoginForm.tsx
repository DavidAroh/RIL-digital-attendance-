import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { LogIn, KeyRound, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { Alert, AlertDescription } from "../ui/alert";

export function LoginForm({ onToggle }: { onToggle: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn, requestForgotPassword } = useAuth();
  const [showForgot, setShowForgot] = useState(false);
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full shadow-sm">
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-1 text-foreground">
          {showForgot ? (
            <KeyRound className="w-5 h-5" />
          ) : (
            <LogIn className="w-5 h-5" />
          )}
        </div>
        <CardTitle className="text-xl">
          {showForgot ? "Reset Password" : "Staff Sign In"}
        </CardTitle>
        <CardDescription>
          {showForgot
            ? "Enter your work email to receive a recovery link"
            : "Sign in with your organization credentials"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {showForgot ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setSuccess("");
              setLoading(true);
              try {
                await requestForgotPassword(email);
                setSuccess("Check your email for a link to reset your password.");
                try {
                  localStorage.setItem("last_reset_email", email.trim());
                } catch {
                  void 0;
                }
              } catch (err) {
                setError(
                  err instanceof Error
                    ? err.message
                    : "Failed to send reset email"
                );
              } finally {
                setLoading(false);
              }
            }}
            className="space-y-4"
          >
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Work Email</Label>
              <Input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.johnson@company.com"
                required
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending link..." : "Send Recovery Link"}
            </Button>
            <div className="text-center pt-2">
              <Button
                variant="link"
                type="button"
                size="sm"
                onClick={() => {
                  setShowForgot(false);
                  setError("");
                  setSuccess("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Back to sign in
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="login-email">Work Email</Label>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.johnson@company.com"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="login-password">Password</Label>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setShowForgot(true);
                    setError("");
                    setSuccess("");
                  }}
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground font-normal"
                >
                  Forgot password?
                </Button>
              </div>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full mt-2">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        )}
      </CardContent>

      {!showForgot && (
        <CardFooter className="flex justify-center border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Don't have a staff account?{" "}
            <button
              type="button"
              onClick={onToggle}
              className="text-foreground font-medium hover:underline cursor-pointer"
            >
              Register here
            </button>
          </p>
        </CardFooter>
      )}
    </Card>
  );
}
