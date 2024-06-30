
import { Admin, Resource, ListGuesser, EditGuesser, ShowGuesser } from 'react-admin';
import { Layout } from './Layout';
import { dataProvider } from './dataProvider';


export const App = () => (
    <Admin
        layout={Layout}
        dataProvider={dataProvider}
	>
        <Resource name="posts" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
		<Resource name="comments" list={ListGuesser} edit={EditGuesser} show={ShowGuesser} />
    </Admin>
);

    