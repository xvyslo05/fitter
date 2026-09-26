import { render } from 'preact';
import { App } from './ui/App';
import { applyTheme, loadThemeChoice } from './theme';
import './styles.css';

applyTheme(loadThemeChoice());
render(<App />, document.getElementById('app')!);
