/**
 * Application Configuration
 * This file manages API URLs for different environments
 */

export const API_KEY = '';

export function getHeaders(withBody = false) {
    const headers = {};
    if (withBody) headers['Content-Type'] = 'application/json';
    if (API_KEY) headers['X-API-Key'] = API_KEY;
    return headers;
}

export function fetchApi(url, options = {}) {
    const isBody = options.body !== undefined;
    const headers = { ...getHeaders(isBody), ...options.headers };
    return fetch(url, { ...options, headers });
}

export const config = {
    /**
     * API configuration for different environments
     */
    api: {
        localhost: {
            url: 'http://localhost:8055/api/v1',
            description: 'Local development server'
        },
        production: {
            url: 'https://carmanagementapi.home.ouiouibaguette.fr/api/v1',
            hostname: 'carmanagement.home.ouiouibaguette.fr',
            description: 'Production server'
        }
    },

    /**
     * Get the appropriate API URL based on the current hostname
     * @returns {string} The API base URL
     */
    getApiUrl() {
        const hostname = window.location.hostname;

        // Check if running on localhost or 127.0.0.1
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            console.log('🏠 Environment: Local Development');
            console.log('📡 API URL:', this.api.localhost.url);
            return this.api.localhost.url;
        }

        // Check if running on production domain
        if (hostname === this.api.production.hostname ||
            window.location.href.includes(this.api.production.hostname)) {
            console.log('🌐 Environment: Production');
            console.log('📡 API URL:', this.api.production.url);
            return this.api.production.url;
        }

        // Default to localhost for any other case
        console.warn('⚠️ Unknown hostname:', hostname);
        console.log('📡 Defaulting to:', this.api.localhost.url);
        return this.api.localhost.url;
    }
};

export default config;
