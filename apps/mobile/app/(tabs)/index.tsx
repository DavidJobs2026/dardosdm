import { useEffect, useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { api } from "../../src/lib/api";
import { Tournament } from "@tournament/types";

const FORMAT_LABELS = {
  single_elimination: "Elim. Simple",
  double_elimination: "Doble Elim.",
  round_robin: "Round Robin",
};

const STATUS_COLORS = {
  draft: "#6b7280",
  registration: "#3b82f6",
  in_progress: "#22c55e",
  completed: "#a855f7",
  cancelled: "#ef4444",
};

const STATUS_LABELS = {
  draft: "Borrador",
  registration: "Inscripciones",
  in_progress: "En curso",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

export default function TournamentsScreen() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const fetchTournaments = async () => {
    try {
      const { data } = await api.get("/tournaments");
      setTournaments(data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTournaments(); }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={tournaments}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTournaments(); }} tintColor="#0ea5e9" />}
        renderItem={({ item: t }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push(`/tournaments/${t.id}`)}
            activeOpacity={0.8}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.badge, { backgroundColor: STATUS_COLORS[t.status] + "30" }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[t.status] }]}>
                  {STATUS_LABELS[t.status]}
                </Text>
              </View>
              <Text style={styles.format}>{FORMAT_LABELS[t.format]}</Text>
            </View>

            <Text style={styles.name}>{t.name}</Text>
            {t.description && <Text style={styles.desc} numberOfLines={2}>{t.description}</Text>}

            <View style={styles.footer}>
              <Text style={styles.meta}>👥 {t.participantsCount}/{t.maxParticipants}</Text>
              <Text style={styles.meta}>by {t.organizer.name}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No hay torneos disponibles</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#030712" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, gap: 12 },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1f2937",
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  format: { fontSize: 11, color: "#6b7280" },
  name: { fontSize: 16, fontWeight: "700", color: "#f9fafb", marginBottom: 4 },
  desc: { fontSize: 13, color: "#9ca3af", marginBottom: 10 },
  footer: { flexDirection: "row", justifyContent: "space-between" },
  meta: { fontSize: 12, color: "#6b7280" },
  emptyText: { color: "#4b5563", fontSize: 16 },
});
