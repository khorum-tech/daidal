import type { Preview } from '@storybook/sveltekit';
import '../src/lib/styles/nocturne.css';
import '../src/lib/styles/app.css';

const preview: Preview = {
	parameters: {
		backgrounds: { disable: true },
		controls: {
			matchers: {
				color: /(background|color)$/i,
				date: /Date$/i
			}
		},
		// Every component is checked against accessibility rules in the a11y panel; failures are errors.
		a11y: { test: 'error' }
	}
};

export default preview;
