import { useState, useEffect } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase"; // Ret stien efter behov
import { Profile, NexusItem } from "../types";
import { InboxData } from "@/dashboard/types";

export const useNexusData = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<NexusItem[]>([]);
  const [inboxData, setInboxData] = useState<InboxData | null>(null);

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) {
      setProfiles([]);
      setItems([]);
      setInboxData(null);
      return;
    }

    // Profiles
    const unsubProfiles = onSnapshot(
      collection(db, "users", user.uid, "profiles"),
      (snap) => {
        const p = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Profile[];
        setProfiles(p);
      }
    );

    // Items
    const unsubItems = onSnapshot(
      collection(db, "users", user.uid, "items"),
      (snap) => {
        const i = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as NexusItem[];
        setItems(i);
      }
    );

    // Inbox
    const unsubInbox = onSnapshot(
      doc(db, "users", user.uid, "inbox_data", "global"),
      (snap) => {
        if (snap.exists()) {
          setInboxData({
            id: snap.id,
            ...(snap.data() as Omit<InboxData, "id">),
          });
        } else {
          setInboxData({ id: "global", tabs: [] });
        }
      }
    );

    return () => {
      unsubProfiles();
      unsubItems();
      unsubInbox();
    };
  }, [user]);

  return { user, setUser, profiles, items, inboxData };
};
