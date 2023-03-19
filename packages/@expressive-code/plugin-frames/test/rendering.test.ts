import { describe, expect, test } from 'vitest'
import { Parent } from 'hast-util-to-html/lib/types'
import { ExpressiveCode } from '@expressive-code/core'
import { matches, select, selectAll } from 'hast-util-select'
import { frames } from '../src'

describe('Renders frames around the code', () => {
	test('Single JS block without title', () => {
		const ec = new ExpressiveCode({
			plugins: [frames()],
		})
		const { renderedGroupAst } = ec.render({
			code: `import { defineConfig } from 'example/config'`,
			language: 'js',
			meta: '',
		})

		validateBlockAst({
			renderedGroupAst,
			figureSelector: '.code-snippet:not(.has-title):not(.is-terminal)',
			srTitlePresent: false,
		})
	})
	test('Single JS block with title', () => {
		const ec = new ExpressiveCode({
			plugins: [frames()],
		})
		const { renderedGroupAst } = ec.render({
			code: `
// test.config.mjs

import { defineConfig } from 'example/config'
			`.trim(),
			language: 'js',
			meta: '',
		})

		validateBlockAst({
			renderedGroupAst,
			figureSelector: '.code-snippet.has-title:not(.is-terminal)',
			title: 'test.config.mjs',
			srTitlePresent: false,
		})
	})
	test('Single terminal block without title', () => {
		const ec = new ExpressiveCode({
			plugins: [frames()],
		})
		const { renderedGroupAst } = ec.render({
			code: 'pnpm i expressive-code',
			language: 'shell',
			meta: '',
		})

		validateBlockAst({
			renderedGroupAst,
			figureSelector: '.code-snippet.is-terminal:not(.has-title)',
			srTitlePresent: true,
		})
	})
	test('Single terminal block with title', () => {
		const ec = new ExpressiveCode({
			plugins: [frames()],
		})
		const { renderedGroupAst } = ec.render({
			code: 'pnpm i expressive-code',
			language: 'shell',
			meta: 'title="Installing Expressive Code"',
		})

		validateBlockAst({
			renderedGroupAst,
			figureSelector: '.code-snippet.has-title.is-terminal',
			title: 'Installing Expressive Code',
			srTitlePresent: false,
		})
	})
})

function validateBlockAst({
	renderedGroupAst,
	figureSelector,
	title,
	srTitlePresent,
}: {
	renderedGroupAst: Parent
	figureSelector: string
	title?: string
	srTitlePresent: boolean
}) {
	// Expect the AST to only contain a single figure element
	const figures = selectAll('figure', renderedGroupAst)
	expect(figures).toHaveLength(1)

	// Expect our figure wrapper to match the given selector
	expect(matches(figureSelector, figures[0])).toEqual(true)

	// Ensure that there is a header (we always render it for styling)
	expect(selectAll('figure > figcaption.header', renderedGroupAst)).toHaveLength(1)

	// Check visible title
	const titles = selectAll('figure > figcaption.header > span.title', renderedGroupAst)
	expect(titles).toHaveLength(title ? 1 : 0)
	if (title) {
		expect(titles[0].children[0].type === 'text' ? titles[0].children[0].value : '').toEqual(title)
	}

	// Check screen reader-only title
	expect(selectAll('figure > figcaption.header > span.sr-only', renderedGroupAst)).toHaveLength(srTitlePresent ? 1 : 0)

	// Expect the figcaption to be followed by a pre element
	expect(select('figure > figcaption + pre', renderedGroupAst)).toBeTruthy()
}
