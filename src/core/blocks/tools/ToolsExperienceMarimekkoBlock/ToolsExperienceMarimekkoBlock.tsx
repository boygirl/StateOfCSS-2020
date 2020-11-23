// @ts-ignore
import React, { useMemo } from 'react'
import { keyBy, sortBy } from 'lodash'
// @ts-ignore
import { useI18n } from 'core/i18n/i18nContext'
// @ts-ignore
import Block from 'core/blocks/block/Block'
// @ts-ignore
import ChartContainer from 'core/charts/ChartContainer'
import { BlockContext } from '../../types'
import { ToolsExperienceToolData, ToolsExperienceMarimekkoToolData } from './types'
import { ToolsExperienceMarimekkoChart, MARGIN, ROW_HEIGHT } from './ToolsExperienceMarimekkoChart'

/**
 * Convert raw API data to be compatible with nivo Marimekko chart.
 *
 * We also have to recompute the percentages as those returned by
 * the API are global, for this chart awareness is represented
 * using the thickness of the bars, so we want percentages relative
 * to awareness only.
 */
const useNormalizedData = (
    rawData: ToolsExperienceToolData[]
): ToolsExperienceMarimekkoToolData[] =>
    useMemo(() => {
        let data: ToolsExperienceMarimekkoToolData[] = rawData.map((tool) => {
            const keyedBuckets = keyBy(tool.experience.year.buckets, 'id')

            const total = tool.experience.year.total
            const aware = total - keyedBuckets.never_heard.count

            return {
                tool: tool.entity,
                awareness: aware,
                would_not_use: (keyedBuckets.would_not_use.count / aware) * 100 * -1,
                not_interested: (keyedBuckets.not_interested.count / aware) * 100 * -1,
                interested: (keyedBuckets.interested.count / aware) * 100,
                would_use: (keyedBuckets.would_use.count / aware) * 100,
            }
        })

        // tools with the most positive experience come first,
        // interested users and users willing to use it again
        data = sortBy(data, (datum) => datum.interested + datum.would_use)
        data.reverse()

        return data
    }, [rawData])

interface ToolsExperienceMarimekkoBlockProps {
    index: number
    block: BlockContext<
        'toolsExperienceMarimekkoTemplate',
        'ToolsExperienceMarimekkoBlock',
        { toolIds: string },
        any
    >
    data: ToolsExperienceToolData[]
}

export const ToolsExperienceMarimekkoBlock = ({
    block,
    data,
}: ToolsExperienceMarimekkoBlockProps) => {
    const { translate } = useI18n()
    const title = translate(`blocks.tools_experience_marimekko.title`)
    const description = translate(`blocks.tools_experience_marimekko.description`)

    const normalizedData = useNormalizedData(data)

    // make the height relative to the number of tools
    // in order to try to get consistent sizes across
    // the different sections, otherwise sections with
    // fewer tools would appear to have a better awareness
    // than those with more.
    const height = MARGIN.top + ROW_HEIGHT * data.length + MARGIN.bottom

    return (
        <Block
            block={{
                ...block,
                title,
                description,
                showLegend: false,
            }}
            data={data}
        >
            <ChartContainer fit height={height}>
                <ToolsExperienceMarimekkoChart data={normalizedData} />
            </ChartContainer>
        </Block>
    )
}
