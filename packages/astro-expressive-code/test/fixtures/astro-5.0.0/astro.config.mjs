// @ts-check
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import { astroExpressiveCode } from 'astro-expressive-code'
import customMd from './shiki-langs/custom-md.mjs'

// https://astro.build/config
export default defineConfig({
	integrations: [
		astroExpressiveCode({
			shiki: {
				// This should get extended by the additional language specified in `ec.config.mjs`
				langs: [customMd],
			},
			// This should get overwritten by the themes specified in `ec.config.mjs`
			themes: ['github-dark', 'github-light'],
			// This should get merged with the overrides specified in `ec.config.mjs`
			styleOverrides: {
				textMarkers: {
					// If deep merging works, this customization should be kept
					// as it's not overwritten in `ec.config.mjs`
					lineMarkerAccentWidth: '0.3rem',
					// But this one should get overwritten
					inlineMarkerBorderWidth: '10px',
				},
			},
		}),
		mdx(),
	],
})
