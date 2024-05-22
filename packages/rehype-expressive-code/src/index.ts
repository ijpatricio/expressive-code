import type { VFileWithOutput } from 'unified'
import type { VFile } from 'vfile'
import {
	BundledShikiTheme,
	loadShikiTheme,
	ExpressiveCode,
	ExpressiveCodeConfig,
	ExpressiveCodeTheme,
	ExpressiveCodeBlockOptions,
	ExpressiveCodeBlock,
	ExpressiveCodeThemeInput,
} from 'expressive-code'
import type { Root, Parents, Element } from 'expressive-code/hast'
import { visit } from 'expressive-code/hast'
import { CodeBlockInfo, createInlineAssetElement, getCodeBlockInfo } from './utils'

type AnyVFile = VFile | VFileWithOutput<null>

export * from 'expressive-code'

export type RehypeExpressiveCodeOptions = Omit<ExpressiveCodeConfig, 'themes'> & {
	/**
	 * The color themes that should be available for your code blocks.
	 *
	 * CSS variables will be generated for all themes, allowing to select the theme to display
	 * using CSS. If you specify one dark and one light theme, a `prefers-color-scheme` media query
	 * will also be generated by default. You can customize this to match your site's needs
	 * through the `useDarkModeMediaQuery` and `themeCssSelector` options.
	 *
	 * The following item types are supported in this array:
	 * - any theme name bundled with Shiki (e.g. `dracula`)
	 * - any theme object compatible with VS Code or Shiki (e.g. imported from an NPM theme package)
	 * - any ExpressiveCodeTheme instance (e.g. using `ExpressiveCodeTheme.fromJSONString(...)`
	 *   to load a custom JSON/JSONC theme file yourself)
	 *
	 * Defaults to `['github-dark', 'github-light']`, two themes bundled with Shiki.
	 */
	themes?: ThemeObjectOrShikiThemeName[] | undefined
	/**
	 * The number of spaces that should be used to render tabs. Defaults to 2.
	 *
	 * Any tabs found in code blocks in your markdown/MDX documents will be replaced
	 * with the specified number of spaces. This ensures that the code blocks are
	 * rendered consistently across browsers and platforms.
	 *
	 * If you want to preserve tabs in your code blocks, set this option to 0.
	 */
	tabWidth?: number | undefined
	/**
	 * This optional function provides support for multi-language sites by allowing you
	 * to customize the locale used for a given code block.
	 *
	 * If the function returns `undefined`, the default locale provided in the
	 * Expressive Code configuration is used.
	 */
	getBlockLocale?: (({ input, file }: { input: ExpressiveCodeBlockOptions; file: AnyVFile }) => string | undefined | Promise<string | undefined>) | undefined
	/**
	 * This optional function allows you to customize how `ExpressiveCodeBlock`
	 * instances are created from code blocks found in the Markdown document.
	 *
	 * The function is called with an object containing the following properties:
	 * - `input`: Block data for the `ExpressiveCodeBlock` constructor.
	 * - `file`: A `VFile` instance representing the Markdown document.
	 *
	 * The function is expected to return an `ExpressiveCodeBlock` instance
	 * or a promise resolving to one.
	 */
	customCreateBlock?: (({ input, file }: { input: ExpressiveCodeBlockOptions; file: AnyVFile }) => ExpressiveCodeBlock | Promise<ExpressiveCodeBlock>) | undefined
	/**
	 * This advanced option allows you to influence the rendering process by creating
	 * your own `ExpressiveCode` instance or processing the base styles and JS modules
	 * added to every page.
	 *
	 * The return value will be cached and used for all code blocks on the site.
	 */
	customCreateRenderer?: ((options: RehypeExpressiveCodeOptions) => Promise<RehypeExpressiveCodeRenderer> | RehypeExpressiveCodeRenderer) | undefined
}

export type ThemeObjectOrShikiThemeName = BundledShikiTheme | ExpressiveCodeTheme | ExpressiveCodeThemeInput

export type RehypeExpressiveCodeDocument = {
	/**
	 * The full path to the source file containing the code block.
	 */
	sourceFilePath?: string | undefined
}

export type RehypeExpressiveCodeRenderer = {
	ec: ExpressiveCode
	baseStyles: string
	themeStyles: string
	jsModules: string[]
}

/**
 * Creates an `ExpressiveCode` instance using the given `options`,
 * including support to load themes bundled with Shiki by name.
 *
 * Returns the created `ExpressiveCode` instance together with the base styles and JS modules
 * that should be added to every page.
 */
export async function createRenderer(options: RehypeExpressiveCodeOptions = {}): Promise<RehypeExpressiveCodeRenderer> {
	// Transfer deprecated `theme` option to `themes` without triggering the deprecation warning
	const deprecatedOptions: Omit<RehypeExpressiveCodeOptions, 'theme'> & { theme?: ThemeObjectOrShikiThemeName | ThemeObjectOrShikiThemeName[] | undefined } = options
	if (deprecatedOptions.theme && !options.themes) {
		options.themes = Array.isArray(deprecatedOptions.theme) ? deprecatedOptions.theme : [deprecatedOptions.theme]
		delete deprecatedOptions.theme
	}
	const { themes, ...ecOptions } = options

	const loadedThemes =
		themes &&
		(await Promise.all(
			(Array.isArray(themes) ? themes : [themes]).map(async (theme) => {
				const mustLoadTheme = theme !== undefined && !(theme instanceof ExpressiveCodeTheme)
				const optLoadedTheme = mustLoadTheme ? new ExpressiveCodeTheme(typeof theme === 'string' ? await loadShikiTheme(theme) : theme) : theme
				return optLoadedTheme
			})
		))
	const ec = new ExpressiveCode({
		themes: loadedThemes,
		...ecOptions,
	})
	const baseStyles = await ec.getBaseStyles()
	const themeStyles = await ec.getThemeStyles()
	const jsModules = await ec.getJsModules()

	return {
		ec,
		baseStyles,
		themeStyles,
		jsModules,
	}
}

function rehypeExpressiveCode(options: RehypeExpressiveCodeOptions = {}) {
	const { tabWidth = 2, getBlockLocale, customCreateRenderer, customCreateBlock } = options

	let asyncRenderer: Promise<RehypeExpressiveCodeRenderer> | RehypeExpressiveCodeRenderer | undefined

	const renderBlockToHast = async ({
		codeBlock,
		renderer,
		addedStyles,
		addedJsModules,
		useMdxJsx,
	}: {
		codeBlock: ExpressiveCodeBlock
		renderer: RehypeExpressiveCodeRenderer
		addedStyles: Set<string>
		addedJsModules: Set<string>
		useMdxJsx: boolean
	}): Promise<Element> => {
		const { ec, baseStyles, themeStyles, jsModules } = renderer

		// Try to render the current code block
		const { renderedGroupAst, styles } = await ec.render(codeBlock)

		// Collect any style and script elements that we need to add to the output
		const extraElements: Element['children'] = []
		const stylesToPrepend: string[] = []

		// Add any styles that we haven't added yet
		// - Base styles
		if (baseStyles && !addedStyles.has(baseStyles)) {
			addedStyles.add(baseStyles)
			stylesToPrepend.push(baseStyles)
		}
		// - Theme styles
		if (themeStyles && !addedStyles.has(themeStyles)) {
			addedStyles.add(themeStyles)
			stylesToPrepend.push(themeStyles)
		}
		// - Group-level styles
		for (const style of styles) {
			if (addedStyles.has(style)) continue
			addedStyles.add(style)
			stylesToPrepend.push(style)
		}
		// Combine all styles we collected (if any) into a single style element
		if (stylesToPrepend.length) {
			extraElements.push(
				createInlineAssetElement({
					tagName: 'style',
					innerHTML: stylesToPrepend.join(''),
					useMdxJsx,
				})
			)
		}

		// Create script elements for all JS modules we haven't added yet
		jsModules.forEach((moduleCode) => {
			if (addedJsModules.has(moduleCode)) return
			addedJsModules.add(moduleCode)
			extraElements.push(
				createInlineAssetElement({
					tagName: 'script',
					properties: { type: 'module' },
					innerHTML: moduleCode,
					useMdxJsx,
				})
			)
		})

		// Prepend any extra elements to the children of the renderedGroupAst wrapper,
		// which keeps them inside the wrapper and reduces the chance of CSS issues
		// caused by selectors like `* + *` on the parent level
		renderedGroupAst.children.unshift(...extraElements)

		return renderedGroupAst
	}

	const transformer = async (tree: Root, file: AnyVFile) => {
		const nodesToProcess: [Parents, CodeBlockInfo][] = []

		visit(tree, 'element', (element, index, parent) => {
			if (index === null || !parent) return
			const codeBlockInfo = getCodeBlockInfo(element)
			if (codeBlockInfo) nodesToProcess.push([parent, codeBlockInfo])
		})

		if (nodesToProcess.length === 0) return

		// We found at least one code node, so we need to ensure our renderer is available
		// and wait for its initialization if necessary
		if (asyncRenderer === undefined) {
			asyncRenderer = (customCreateRenderer ?? createRenderer)(options)
		}
		const renderer = await asyncRenderer

		// Determine how to render style and script elements based on the environment and file type
		// (Astro allows using regular HTML elements in MDX, while Next.js requires JSX)
		const isAstro = file.data?.astro !== undefined
		const isMdx = file.path?.endsWith('.mdx') ?? false
		const useMdxJsx = !isAstro && isMdx

		// Render all code blocks on the page while keeping track of the assets we already added
		const addedStyles = new Set<string>()
		const addedJsModules = new Set<string>()

		for (let groupIndex = 0; groupIndex < nodesToProcess.length; groupIndex++) {
			const [parent, code] = nodesToProcess[groupIndex]

			// Normalize the code coming from the Markdown/MDX document
			let normalizedCode = code.text
			if (tabWidth > 0) normalizedCode = normalizedCode.replace(/\t/g, ' '.repeat(tabWidth))

			// Build the ExpressiveCodeBlockOptions object that we will pass either
			// to the ExpressiveCodeBlock constructor or the customCreateBlock function
			const input: ExpressiveCodeBlockOptions = {
				code: normalizedCode,
				language: code.lang || '',
				meta: code.meta || '',
				parentDocument: {
					sourceFilePath: file.path,
					documentRoot: tree,
					positionInDocument: {
						groupIndex,
						totalGroups: nodesToProcess.length,
					},
				},
			}

			// Allow the user to customize the locale for this code block
			if (getBlockLocale) {
				input.locale = await getBlockLocale({ input: input, file })
			}

			// Allow the user to customize the ExpressiveCodeBlock instance
			const codeBlock = customCreateBlock ? await customCreateBlock({ input, file }) : new ExpressiveCodeBlock(input)

			// Render the code block and use it to replace the found `<pre>` element
			const renderedBlock = await renderBlockToHast({ codeBlock, renderer, addedStyles, addedJsModules, useMdxJsx })
			parent.children.splice(parent.children.indexOf(code.pre), 1, renderedBlock)
		}
	}

	return transformer
}

export default rehypeExpressiveCode