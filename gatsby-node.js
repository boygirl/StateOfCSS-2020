const fs = require('fs')
const path = require('path')
const yaml = require('js-yaml')
const _ = require('lodash')
const indentString = require('indent-string')
const { computeSitemap } = require('./node_src/sitemap/index.js')
const { omit } = require('lodash')

const config = yaml.safeLoad(fs.readFileSync('./config/config.yml', 'utf8'))

require('dotenv').config({
    path: `.env`
})

const localesQuery = `
query {
    surveyApi {
        locales(contexts: [${config.translationContexts.join(', ')}]) {
            completion
            id
            label
            strings {
                key
                t
                context
                fallback
            }
            translators
        }
    }
}
`

const rawSitemap = yaml.safeLoad(fs.readFileSync('./config/raw_sitemap.yml', 'utf8'))
// const locales = yaml.safeLoad(fs.readFileSync('./config/locales.yml', 'utf8'))

const getLocalizedPath = (path, locale) => locale ? `/${locale.id}${path}` : path

const getPageContext = page => {
    const context = omit(page, ['path', 'children'])
    context.basePath = page.path

    return {
        ...context,
        ...page.data
    }
}

const createBlockPages = (page, context, createPage, locales) => {
    const blocks = page.blocks
    if (!Array.isArray(blocks) || blocks.length === 0) {
        return
    }

    blocks.forEach(block => {
        // allow for specifying explicit pageId in block definition
        if (!block.pageId) {
            block.pageId = page.id
        }
        locales.forEach(locale => {
            const blockPage = {
                path: getLocalizedPath(block.path, locale),
                component: path.resolve(`./src/core/share/ShareBlockTemplate.js`),
                context: {
                    ...context,
                    redirect: `${getLocalizedPath(page.path, locale)}#${block.id}`,
                    block,
                    locale: locale.locale,
                    localePath: locale.path === 'default' ? '' : `/${locale.path}`
                }
            }
            createPage(blockPage)
        })
    })
}

const cleanIdString = id => id.replace(new RegExp('-', 'g'), '_')

/**
 * Loop over a page's blocks to assemble its page query
 *
 * Arguments: the page's $id
 */
const getPageQuery = page => {
    const { id, blocks } = page
    if (!blocks) {
        return
    }
    const queries = _.compact(blocks.map(b => b.query))
    if (queries.length === 0) {
        return
    }
    const variables = _.compact(blocks.map(b => b.queryVariables))
    const pageQuery = `query page${_.upperFirst(cleanIdString(id))}Query${variables.length > 0 ? `(${variables.join(', ')})` : ''} {
${indentString(queries.join('\n'), 4)}
}`
    return pageQuery
}

exports.createPages = async ({ graphql, actions: { createPage, createRedirect } }) => {
    const { flat } = await computeSitemap(rawSitemap)

    const localesResults = await graphql(`${localesQuery}`)
    const locales = localesResults.data.surveyApi.locales

    for (const page of flat) {
        let pageData = {}
        const context = getPageContext(page)

        // loop over locales
        for (let index = 0; index < locales.length; index++) {
            const locale = locales[index]
            locale.path = `/${locale.id}`
            
            // console.log('// pageQuery')
            const pageQuery = getPageQuery(page)
    
            try {
                if (pageQuery) {
                    const queryResults = await graphql(`${pageQuery}`, { id: page.id, localeId: locale.id })
                    // console.log('// queryResults')
                    // console.log(JSON.stringify(queryResults.data, '', 2))
                    pageData = queryResults.data
                }
            } catch (error) {
                console.log(`// Error while loading data for page ${page.id}`)
                console.log(pageQuery)
                console.log(error)
            }

            const pageObject = {
                path: getLocalizedPath(page.path, locale),
                component: path.resolve(`./src/core/pages/PageTemplate.js`),
                context: {
                    ...context,
                    locales,
                    locale,
                    pageData,
                    pageQuery, // passed for debugging purposes
                }
            }
            createPage(pageObject)

            // also redirect "naked" paths (whithout a locale) to en-US
            if (locale.id === 'en-US') {
                createRedirect({ fromPath: getLocalizedPath(page.path, null), toPath: getLocalizedPath(page.path, locale), isPermanent: true })
            }
        }

        createBlockPages(page, context, createPage, locales)
    }
}

/**
 * Fix case for pages path, it's not obvious on OSX which is case insensitive,
 * but on some environments (eg. travis), it's a problem.
 *
 * Many pages are created from components, and we use upper first in that case
 * for the file name, so when gatsby generates the static page, it has the same name.
 *
 * Implement the Gatsby API “onCreatePage”.
 * This is called after every page is created.
 */
// exports.onCreatePage = async ({ page, graphql, actions }) => {
//     const { createPage, deletePage } = actions

//     const { flat } = await computeSitemap(rawSitemap)

//     const localesResults = await graphql(`${localesQuery}`)
//     console.log(localesResults)
//     const locales = localesResults.data.surveyApi.locales

//     // handle 404 page separately
//     const is404 = page.path.includes('404')

//     const pagePath = page.path.toLowerCase()
//     const matchingPage = flat.find(p => p.path === (is404 ? '/404/' : pagePath))

//     // if there's no matching page
//     // it means we're dealing with an internal page
//     // thus, we don't create one for each locale
//     if (matchingPage === undefined) {
//         if (pagePath !== page.path) {
//             deletePage(page)
//             createPage({
//                 ...page,
//                 path: pagePath
//             })
//         }
//         return
//     }

//     // add context, required for pagination
//     const context = {
//         ...page.context,
//         ...getPageContext(matchingPage)
//     }
//     const newPage = {
//         ...page,
//         path: pagePath,
//         context
//     }

//     deletePage(page)

//     // create page for each available locale
//     for (let locale of locales) {
//         createPage({
//             ...newPage,
//             path: localizedPath(newPage.path, locale),
//             context: {
//                 ...newPage.context,
//                 locale: locale.locale,
//                 localeLabel: locale.label,
//                 localePath: locale.path === 'default' ? '' : `/${locale.path}`
//             }
//         })
//     }

//     createBlockPages(page, context, createPage)
// }

// Allow absolute imports and inject `ENV`
exports.onCreateWebpackConfig = ({ stage, actions, plugins }) => {
    actions.setWebpackConfig({
        resolve: {
            modules: [path.resolve(__dirname, 'src'), 'node_modules']
        },
        plugins: [
            plugins.define({
                ENV: stage === `develop` || stage === `develop-html` ? 'development' : 'production'
            })
        ]
    })
}
