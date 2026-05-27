'use client';
/**
 * Custom Login Page Override
 *
 * Injected into apps/manage-ui/src/app/login/page.tsx by Dockerfile after export.
 *
 * Why this exists:
 *   The upstream login page is email-first (enterprise/invite-only flow). It runs an
 *   auth-lookup on the entered email and only shows the Google button if the email
 *   already belongs to a known organization — meaning new users never see it.
 *
 *   This page puts "Sign in with Google" front and centre as the primary action.
 *   Better Auth's social sign-in auto-creates the user + organization on first login,
 *   so any Google user can self-register and gets their own workspace.
 *
 *   Email + password is kept as a secondary option (collapsible) so the admin account
 *   and invited users can still sign in the traditional way.
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircleIcon, Loader2, Mail } from 'lucide-react';
import { GoogleColorIcon } from '@/components/icons/google';
import { InkeepIcon } from '@/components/icons/inkeep';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuthClient } from '@/contexts/auth-client';
import { useAuthSession } from '@/hooks/use-auth';
import { getSafeReturnUrl, isValidReturnUrl } from '@/lib/utils/auth-redirect';

function LoginForm() {
  const authClient = useAuthClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');
  const invitationId = searchParams.get('invitation');
  const { isAuthenticated, isLoading: isSessionLoading } = useAuthSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Surface any OAuth error passed back via query params
  const urlError = searchParams.get('error');
  const urlErrorDescription = searchParams.get('error_description');
  useEffect(() => {
    if (urlError) {
      setError(`${urlErrorDescription || urlError}`.replace(/_/g, ' '));
    }
  }, [urlError, urlErrorDescription]);

  // Redirect once authenticated
  useEffect(() => {
    if (!isSessionLoading && isAuthenticated) {
      if (invitationId) {
        router.replace(`/accept-invitation/${invitationId}`);
      } else if (returnUrl && isValidReturnUrl(returnUrl)) {
        router.replace(returnUrl);
      } else {
        router.replace('/');
      }
    }
  }, [isAuthenticated, isSessionLoading, invitationId, returnUrl, router]);

  /** Build the post-login redirect URL */
  const getCallbackURL = () => {
    if (typeof window === 'undefined') return '/';
    if (invitationId) return `${window.location.origin}/accept-invitation/${invitationId}`;
    const safe = getSafeReturnUrl(returnUrl, '/');
    // safe is a relative path — make it absolute so Better Auth can redirect back
    return safe.startsWith('http') ? safe : `${window.location.origin}${safe}`;
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: getCallbackURL(),
      });
      if (result?.error) {
        setError(result.error.message || 'Google sign in failed');
        setIsGoogleLoading(false);
      }
      // On success the browser is redirected by Better Auth — no explicit navigation needed
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setIsGoogleLoading(false);
    }
  };

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsPasswordLoading(true);
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) {
        setError(
          result.error.code === 'PASSWORD_COMPROMISED'
            ? 'Invalid email or password'
            : result.error.message || 'Sign in failed'
        );
        setIsPasswordLoading(false);
        return;
      }
      router.replace(getSafeReturnUrl(returnUrl, '/'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setIsPasswordLoading(false);
    }
  };

  if (isSessionLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md shadow-none border-none bg-transparent space-y-3">
        <div className="px-6">
          <InkeepIcon size={48} />
        </div>

        <CardHeader>
          <CardTitle className="text-2xl font-medium tracking-tight text-foreground">
            Welcome
          </CardTitle>
          <CardDescription>
            Sign in with Google to access your workspace, or create one automatically on first sign‑in.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {error && (
            <Alert variant="destructive" className="border-destructive/10 dark:border-border">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* ── Primary: Google ─────────────────────────────────────────── */}
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center gap-3 h-11"
            onClick={handleGoogleSignIn}
            disabled={isGoogleLoading || isPasswordLoading}
          >
            {isGoogleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <GoogleColorIcon className="h-5 w-5 shrink-0" />
            )}
            <span>{isGoogleLoading ? 'Redirecting to Google…' : 'Continue with Google'}</span>
          </Button>

          {/* ── Divider ─────────────────────────────────────────────────── */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">or</span>
            </div>
          </div>

          {/* ── Secondary: Email + Password (collapsible) ────────────────── */}
          {!showEmailForm ? (
            <Button
              type="button"
              variant="ghost"
              className="w-full flex items-center gap-2 text-muted-foreground text-sm"
              onClick={() => setShowEmailForm(true)}
              disabled={isGoogleLoading}
            >
              <Mail className="h-4 w-4 shrink-0" />
              Sign in with email and password
            </Button>
          ) : (
            <form onSubmit={handlePasswordSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isPasswordLoading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isPasswordLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isPasswordLoading}>
                {isPasswordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                onClick={() => setShowEmailForm(false)}
              >
                ← Back
              </button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            New users are automatically registered on first Google sign‑in.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
