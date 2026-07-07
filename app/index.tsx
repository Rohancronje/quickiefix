import { Redirect } from 'expo-router';

/** The routing decision itself lives in the root layout; send users to the
 *  auth group by default and let the guard bounce them to the right place. */
export default function Index() {
  return <Redirect href="/(auth)/welcome" />;
}
