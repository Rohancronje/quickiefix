import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Screen } from '../../../src/components/Screen';
import { JobCard } from '../../../src/components/JobCard';
import { Card, EmptyState, Txt } from '../../../src/components/ui';
import { useCustomer } from '../../../src/context/AuthContext';
import { useCustomerJobs } from '../../../src/hooks/useData';
import { useNow } from '../../../src/hooks/useNow';
import { spacing } from '../../../src/theme';

export default function CustomerActivity() {
  const customer = useCustomer();
  const router = useRouter();
  const now = useNow();
  const jobs = useCustomerJobs(customer.id);

  return (
    <Screen>
      <Txt variant="title">Activity</Txt>
      {jobs.length === 0 ? (
        <Card>
          <EmptyState
            emoji="📋"
            title="Nothing here yet"
            subtitle="Every job you request will be tracked here."
          />
        </Card>
      ) : (
        <View style={{ gap: spacing.sm }}>
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              now={now}
              onPress={() => router.push({ pathname: '/track/[id]', params: { id: job.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
