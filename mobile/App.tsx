import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PRESETS } from './src/data/presets';
import {
  getEarningsPayload,
  getLevelsPayload,
  normalizeSymbols,
} from './src/services/analysis';
import type { EarningsPayload, LevelsPayload, Preset } from './src/types';


type AppTab = 'levels' | 'earnings';

const colors = {
  bg: '#071318',
  bg2: '#0f2027',
  panel: '#0d1d22',
  panelSoft: '#13292f',
  text: '#f4fbf8',
  muted: '#9db6af',
  line: 'rgba(129, 173, 160, 0.18)',
  accent: '#f1b85b',
  accent2: '#61d6b4',
  accent3: '#86a7ff',
  danger: '#ff8d8d',
};

const formatNumber = (value: number | null | undefined, digits = 2) => {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return Number(value).toFixed(digits);
};

const symbolText = (preset: Preset) => preset.symbols.join(', ');

const fieldValueFromPreset = (presetId: string) => {
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[0];
  return symbolText(preset);
};

export default function App() {
  const [tab, setTab] = useState<AppTab>('levels');

  const [levelsPreset, setLevelsPreset] = useState(PRESETS[0].id);
  const [levelsSymbols, setLevelsSymbols] = useState(fieldValueFromPreset(PRESETS[0].id));
  const [thesisSymbol, setThesisSymbol] = useState('PLTR');
  const [thesisSupport, setThesisSupport] = useState('130');
  const [thesisTakeProfit, setThesisTakeProfit] = useState('160');
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [levelsPayload, setLevelsPayload] = useState<LevelsPayload | null>(null);
  const [levelsError, setLevelsError] = useState<string | null>(null);

  const [earningsPreset, setEarningsPreset] = useState(PRESETS[0].id);
  const [earningsSymbols, setEarningsSymbols] = useState(fieldValueFromPreset(PRESETS[0].id));
  const [preDays, setPreDays] = useState('60');
  const [postDays, setPostDays] = useState('1');
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsPayload, setEarningsPayload] = useState<EarningsPayload | null>(null);
  const [earningsError, setEarningsError] = useState<string | null>(null);

  useEffect(() => {
    runLevels();
    runEarnings();
  }, []);

  async function runLevels() {
    setLevelsLoading(true);
    setLevelsError(null);
    try {
      const payload = await getLevelsPayload({
        symbols: normalizeSymbols(levelsSymbols),
        thesis: {
          symbol: thesisSymbol.trim().toUpperCase(),
          support: Number(thesisSupport),
          takeProfit: Number(thesisTakeProfit),
        },
      });
      setLevelsPayload(payload);
    } catch (error) {
      setLevelsError(error instanceof Error ? error.message : 'Failed to load levels');
    } finally {
      setLevelsLoading(false);
    }
  }

  async function runEarnings() {
    setEarningsLoading(true);
    setEarningsError(null);
    try {
      const payload = await getEarningsPayload({
        symbols: normalizeSymbols(earningsSymbols),
        preDays: Math.max(20, Number(preDays) || 60),
        postDays: Math.max(1, Number(postDays) || 1),
        mode: 'prepost',
      });
      setEarningsPayload(payload);
    } catch (error) {
      setEarningsError(error instanceof Error ? error.message : 'Failed to load earnings scan');
    } finally {
      setEarningsLoading(false);
    }
  }

  function applyPreset(target: 'levels' | 'earnings', presetId: string) {
    if (target === 'levels') {
      setLevelsPreset(presetId);
      setLevelsSymbols(fieldValueFromPreset(presetId));
      return;
    }
    setEarningsPreset(presetId);
    setEarningsSymbols(fieldValueFromPreset(presetId));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Oil, Defense, War-Tech</Text>
          <Text style={styles.heroTitle}>Find support, take-profit zones, and earnings setups on your phone.</Text>
          <Text style={styles.heroBody}>
            Dad App brings the same stock workflow to Android and iPhone, with technical levels and
            earnings-pattern screens built for quick scanning.
          </Text>
        </View>

        <View style={styles.tabRow}>
          <TabButton label="Levels" active={tab === 'levels'} onPress={() => setTab('levels')} />
          <TabButton label="Earnings" active={tab === 'earnings'} onPress={() => setTab('earnings')} />
        </View>

        {tab === 'levels' ? (
          <View style={styles.section}>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Support and Take-Profit</Text>
              <Text style={styles.sectionBody}>
                Pull recent price structure, estimate support zones, and compare your thesis against the model.
              </Text>

              <PresetStrip
                selectedId={levelsPreset}
                onSelect={(presetId) => applyPreset('levels', presetId)}
              />

              <Field label="Universe">
                <TextInput
                  multiline
                  value={levelsSymbols}
                  onChangeText={setLevelsSymbols}
                  style={[styles.input, styles.multiline]}
                  placeholder="PLTR, LMT, NOC, RTX..."
                  placeholderTextColor={colors.muted}
                />
              </Field>

              <View style={styles.row}>
                <Field label="Thesis Symbol" style={styles.halfField}>
                  <TextInput
                    value={thesisSymbol}
                    onChangeText={setThesisSymbol}
                    autoCapitalize="characters"
                    style={styles.input}
                    placeholder="PLTR"
                    placeholderTextColor={colors.muted}
                  />
                </Field>
                <Field label="Thesis Support" style={styles.halfField}>
                  <TextInput
                    value={thesisSupport}
                    onChangeText={setThesisSupport}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="130"
                    placeholderTextColor={colors.muted}
                  />
                </Field>
              </View>

              <Field label="Thesis Take Profit">
                <TextInput
                  value={thesisTakeProfit}
                  onChangeText={setThesisTakeProfit}
                  keyboardType="numeric"
                  style={styles.input}
                  placeholder="160"
                  placeholderTextColor={colors.muted}
                />
              </Field>

              <Pressable style={styles.primaryButton} onPress={runLevels}>
                <Text style={styles.primaryButtonText}>{levelsLoading ? 'Scanning...' : 'Analyze Levels'}</Text>
              </Pressable>

              <StatusCard
                title="Status"
                value={
                  levelsLoading
                    ? 'Loading'
                    : levelsError
                      ? 'Error'
                      : levelsPayload
                        ? `Loaded ${levelsPayload.results.length} symbols`
                        : 'Idle'
                }
                body={
                  levelsError ??
                  (levelsPayload
                    ? `Updated ${levelsPayload.lastUpdated}. Errors: ${levelsPayload.errors.length}.`
                    : 'Run the scan to see support, risk, and target levels.')
                }
              />
            </View>

            {levelsLoading ? <LoadingPanel /> : null}
            {!levelsLoading && levelsError ? <ErrorPanel message={levelsError} /> : null}
            {!levelsLoading && !levelsError && levelsPayload?.results.map((item) => (
              <View key={item.symbol} style={styles.resultCard}>
                <View style={styles.resultTop}>
                  <View>
                    <Text style={styles.resultTicker}>{item.symbol}</Text>
                    <Text style={styles.resultName}>{item.name}</Text>
                  </View>
                  <Text style={styles.resultPrice}>${formatNumber(item.price)}</Text>
                </View>

                <MetricRow label="Support" value={`$${formatNumber(item.supportLevel)}`} />
                <MetricRow label="Deep Support" value={`$${formatNumber(item.deepSupport)}`} />
                <MetricRow label="Take Profit" value={`$${formatNumber(item.takeProfitLevel)}`} />
                <MetricRow label="Stretch Target" value={`$${formatNumber(item.stretchTarget)}`} />
                <MetricRow label="Reward / Risk" value={formatNumber(item.rewardRiskRatio)} />

                {item.thesisCheck ? (
                  <View style={styles.callout}>
                    <Text style={styles.calloutText}>
                      {item.thesisCheck.symbol} thesis {formatNumber(item.thesisCheck.supportGuess)} to{' '}
                      {formatNumber(item.thesisCheck.takeProfitGuess)}
                    </Text>
                    <Text style={styles.calloutStrong}>
                      {item.thesisCheck.supportMatchesModel ? 'Support close to model' : 'Support differs from model'}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.footnote}>
                  Risk to support {formatNumber(item.riskToSupportPct)}% | Reward to TP {formatNumber(item.rewardToTakeProfitPct)}%
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.section}>
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Earnings Pattern Scanner</Text>
              <Text style={styles.sectionBody}>
                Compare the price at the start of the pre-earnings window against the move after earnings.
              </Text>

              <PresetStrip
                selectedId={earningsPreset}
                onSelect={(presetId) => applyPreset('earnings', presetId)}
              />

              <Field label="Universe">
                <TextInput
                  multiline
                  value={earningsSymbols}
                  onChangeText={setEarningsSymbols}
                  style={[styles.input, styles.multiline]}
                  placeholder="PLTR, LMT, NOC, RTX..."
                  placeholderTextColor={colors.muted}
                />
              </Field>

              <View style={styles.row}>
                <Field label="Pre-Earnings Window" style={styles.halfField}>
                  <TextInput
                    value={preDays}
                    onChangeText={setPreDays}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="60"
                    placeholderTextColor={colors.muted}
                  />
                </Field>
                <Field label="Post-Earnings Window" style={styles.halfField}>
                  <TextInput
                    value={postDays}
                    onChangeText={setPostDays}
                    keyboardType="numeric"
                    style={styles.input}
                    placeholder="1"
                    placeholderTextColor={colors.muted}
                  />
                </Field>
              </View>

              <Pressable style={styles.primaryButton} onPress={runEarnings}>
                <Text style={styles.primaryButtonText}>{earningsLoading ? 'Scanning...' : 'Scan Earnings Pattern'}</Text>
              </Pressable>

              <StatusCard
                title="Status"
                value={
                  earningsLoading
                    ? 'Loading'
                    : earningsError
                      ? 'Error'
                      : earningsPayload
                        ? `Loaded ${earningsPayload.results.length} ranked names`
                        : 'Idle'
                }
                body={
                  earningsError ??
                  (earningsPayload
                    ? `Updated ${earningsPayload.lastUpdated}. Errors: ${earningsPayload.errors.length}.`
                    : 'Run the scan to rank names by earnings behavior.')
                }
              />
            </View>

            {earningsLoading ? <LoadingPanel /> : null}
            {!earningsLoading && earningsError ? <ErrorPanel message={earningsError} /> : null}
            {!earningsLoading && !earningsError && earningsPayload?.results.map((item) => {
              const latest = item.latestCycle;
              return (
                <View key={item.symbol} style={styles.resultCard}>
                  <View style={styles.resultTop}>
                    <View>
                      <Text style={styles.resultTicker}>{item.symbol}</Text>
                      <Text style={styles.resultName}>{item.name}</Text>
                    </View>
                    <Text style={styles.resultPrice}>${formatNumber(item.price)}</Text>
                  </View>

                  <MetricRow label="Hits" value={`${item.patternHits}/${item.eventsTested}`} />
                  <MetricRow label="Hit Rate" value={`${formatNumber(item.hitRatePct)}%`} />
                  <MetricRow label="Avg Difference: Post High vs Pre-Earnings" value={`${formatNumber(item.avgPostHighReturnPct)}%`} />
                  <MetricRow label="Avg Difference: Post Close vs Pre-Earnings" value={`${formatNumber(item.avgPostCloseReturnPct)}%`} />
                  <MetricRow label="Next Earnings" value={item.nextEarningsDate ?? 'n/a'} />

                  {latest ? (
                    <View style={styles.callout}>
                      <Text style={styles.calloutText}>Latest cycle {latest.earningsDate}</Text>
                      <Text style={styles.calloutStrong}>{`${formatNumber(latest.preToPostCloseReturnPct)}% from pre-window start to post-close`}</Text>
                    </View>
                  ) : null}

                  {(item.qualifyingCycles ?? []).slice(0, 3).map((cycle) => (
                    <View key={`${item.symbol}-${cycle.earningsDate}`} style={styles.cycleCard}>
                      <Text style={styles.cycleDate}>{cycle.earningsDate}</Text>
                      <Text style={styles.cycleText}>{`Pre start ${formatNumber(cycle.preAnchorClose)} -> post close ${formatNumber(cycle.preToPostCloseReturnPct)}%`}</Text>
                    </View>
                  ))}
                </View>
              );
            })}

            {!earningsLoading && !earningsError && (earningsPayload?.errors?.length ?? 0) > 0 ? (
              <View style={styles.resultCard}>
                <Text style={styles.sectionTitle}>Failed Symbols</Text>
                {earningsPayload?.errors.map((item) => (
                  <View key={`${item.symbol}-${item.error}`} style={styles.cycleCard}>
                    <Text style={styles.cycleDate}>{item.symbol}</Text>
                    <Text style={styles.cycleText}>{item.error}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PresetStrip({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (presetId: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetStrip}>
      {PRESETS.map((preset) => (
        <Pressable
          key={preset.id}
          onPress={() => onSelect(preset.id)}
          style={[styles.presetChip, preset.id === selectedId && styles.presetChipActive]}
        >
          <Text style={[styles.presetChipText, preset.id === selectedId && styles.presetChipTextActive]}>
            {preset.name}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function StatusCard({ title, value, body }: { title: string; value: string; body: string }) {
  return (
    <View style={styles.statusCard}>
      <View style={styles.statusHeader}>
        <Text style={styles.statusTitle}>{title}</Text>
        <View style={styles.statusPill}>
          <Text style={styles.statusPillText}>{value}</Text>
        </View>
      </View>
      <Text style={styles.statusBody}>{body}</Text>
    </View>
  );
}

function LoadingPanel() {
  return (
    <View style={styles.resultCard}>
      <ActivityIndicator color={colors.accent2} />
      <Text style={styles.loadingText}>Pulling fresh market data...</Text>
    </View>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <View style={styles.resultCard}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 18,
    paddingBottom: 42,
    gap: 18,
  },
  heroCard: {
    backgroundColor: colors.panel,
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  eyebrow: {
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
  },
  heroBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 24,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: 999,
    padding: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#1c3237',
  },
  tabButtonText: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: colors.text,
  },
  section: {
    gap: 18,
  },
  panel: {
    backgroundColor: colors.panel,
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 16,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  sectionBody: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
  },
  presetStrip: {
    gap: 10,
    paddingRight: 10,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg2,
  },
  presetChipActive: {
    backgroundColor: 'rgba(241, 184, 91, 0.12)',
    borderColor: 'rgba(241, 184, 91, 0.35)',
  },
  presetChipText: {
    color: colors.muted,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: colors.text,
  },
  field: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontSize: 11,
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: '#08161a',
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
  },
  inputMuted: {
    opacity: 0.45,
  },
  multiline: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  primaryButton: {
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#314438',
    borderWidth: 1,
    borderColor: 'rgba(241, 184, 91, 0.25)',
  },
  primaryButtonText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 15,
  },
  statusCard: {
    marginTop: 2,
    borderRadius: 22,
    padding: 16,
    backgroundColor: colors.panelSoft,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 10,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  statusTitle: {
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 12,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#173137',
  },
  statusPillText: {
    color: colors.text,
    fontWeight: '700',
  },
  statusBody: {
    color: colors.muted,
    lineHeight: 22,
  },
  resultCard: {
    backgroundColor: colors.panel,
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  resultTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'center',
  },
  resultTicker: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  resultName: {
    color: colors.muted,
    fontSize: 13,
    maxWidth: 230,
  },
  resultPrice: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#102126',
    borderRadius: 16,
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 14,
  },
  metricValue: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  callout: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(134, 167, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(134, 167, 255, 0.18)',
    gap: 6,
  },
  calloutText: {
    color: '#dfe8ff',
  },
  calloutStrong: {
    color: colors.text,
    fontWeight: '800',
  },
  footnote: {
    color: colors.muted,
    fontSize: 13,
  },
  cycleCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#102126',
    gap: 4,
  },
  cycleDate: {
    color: colors.text,
    fontWeight: '700',
  },
  cycleText: {
    color: colors.muted,
    lineHeight: 20,
  },
  loadingText: {
    color: colors.muted,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    lineHeight: 22,
  },
});
