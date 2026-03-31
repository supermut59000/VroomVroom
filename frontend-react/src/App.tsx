import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { Header } from '@/components/layout/Header'
import { OfflineBanner } from '@/components/layout/OfflineBanner'
import { Dashboard } from '@/pages/Dashboard'
import { ErrorBoundary } from '@/components/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" storageKey="vroomvroom-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <OfflineBanner />
          <Header />
          <main className="container mx-auto px-4 py-6">
            <ErrorBoundary>
              <Dashboard />
            </ErrorBoundary>
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </QueryClientProvider>
    </ThemeProvider>
  )
}
