import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { UserPlus, Building2, AlertCircle } from "lucide-react";
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
import { Select } from "../ui/select";
import { Alert, AlertDescription } from "../ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";

export function SignUpForm({ onToggle }: { onToggle: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"employee" | "manager" | "admin">("employee");
  const [department, setDepartment] = useState("");
  const [designation, setDesignation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const { signUp } = useAuth();
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string>("");

  // Auto-redirect after successful signup
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onToggle();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [success, onToggle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signUp(
        email,
        password,
        {
          full_name: fullName,
          role,
          department,
          designation: role !== "admin" ? designation : undefined,
        },
        signatureFile
      );
      setSuccess(
        "Account created successfully! You will be redirected shortly."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSignatureFile(file);
    setSignaturePreview(file ? URL.createObjectURL(file) : "");
  };

  return (
    <>
      <Card className="w-full shadow-sm">
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto w-10 h-10 rounded-lg bg-muted flex items-center justify-center mb-1 text-foreground">
            <UserPlus className="w-5 h-5" />
          </div>
          <CardTitle className="text-xl">Create Staff Account</CardTitle>
          <CardDescription>
            Join your organization's digital attendance portal
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="signup-name">Full Name</Label>
              <Input
                id="signup-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Alex Johnson"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-email">Work Email</Label>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="alex.johnson@company.com"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-password">Password</Label>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-role">Role</Label>
              <Select
                id="signup-role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as "employee" | "manager" | "admin")
                }
              >
                <option value="employee">Employee / Staff</option>
                <option value="manager">Manager / Supervisor</option>
                <option value="admin">HR / Admin</option>
              </Select>
            </div>

            {role !== "admin" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="signup-type">Employment Type</Label>
                  <Select
                    id="signup-type"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    required
                  >
                    <option value="">Select Employment Type</option>
                    <option value="Full-Time">Full-Time</option>
                    <option value="Part-Time">Part-Time</option>
                    <option value="Contractor">Contractor</option>
                    <option value="Intern">Intern</option>
                    <option value="Remote">Remote Staff</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-sig">Digital Signature (Optional Image)</Label>
                  <Input
                    id="signup-sig"
                    type="file"
                    accept="image/*"
                    onChange={handleSignatureChange}
                    className="cursor-pointer"
                  />
                  {signaturePreview && (
                    <div className="mt-2 p-2 border rounded-md bg-muted/40 inline-block">
                      <img
                        src={signaturePreview}
                        alt="Signature preview"
                        className="h-10 object-contain"
                      />
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Used to verify your workplace clock-ins.
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="signup-dept">Department</Label>
              <Input
                id="signup-dept"
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g., Engineering, Marketing, HR, Finance"
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full mt-2">
              {loading ? "Creating Account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex justify-center border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Already have a staff account?{" "}
            <button
              type="button"
              onClick={onToggle}
              className="text-foreground font-medium hover:underline cursor-pointer"
            >
              Sign in
            </button>
          </p>
        </CardFooter>
      </Card>

      {/* Success Dialog */}
      <Dialog open={!!success} onOpenChange={() => onToggle()}>
        <DialogContent className="sm:max-w-md text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-2">
            <Building2 className="w-6 h-6 text-foreground" />
          </div>
          <DialogHeader>
            <DialogTitle className="text-center">Welcome Aboard!</DialogTitle>
            <DialogDescription className="text-center">{success}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center mt-2">
            <Button type="button" onClick={onToggle} className="w-full sm:w-auto">
              Go to Sign In
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
