import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineProvider } from '@/hooks/use-offline'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Render with the same provider stack as the real app (App.tsx), minus theming. */
export function renderWithProviders(ui: ReactElement, queryClient = makeQueryClient()) {
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>{ui}</OfflineProvider>
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}
