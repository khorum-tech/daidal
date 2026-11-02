<script module lang="ts">
	import { defineMeta } from '@storybook/addon-svelte-csf';
	import TourCallout from './TourCallout.svelte';
	import { TOUR } from '../tour';

	const { Story } = defineMeta({
		title: 'Diagram/Tour step',
		component: TourCallout,
		args: { step: TOUR[1], index: 1, total: TOUR.length, onnext: () => {}, onback: () => {}, onend: () => {} }
	});
</script>

<Story name="A step" />
<Story name="On a phone" args={{ narrow: true }} />
<Story name="The last step" args={{ step: TOUR[TOUR.length - 1], index: TOUR.length - 1 }} />
