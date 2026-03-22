import { useState, useMemo } from "react";
import { doc, writeBatch } from "@/lib/firebase";
import { auth, db } from "../../lib/firebase";
import { Profile } from "../dashboard/types";

export const useProfileOrder = (profiles: Profile[]) => {
  // Draft State: 'null' betyder at brugeren ikke har ændret rækkefølgen.
  const [localOrder, setLocalOrder] = useState<Profile[] | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // Memoize den originale, korrekte sortering fra Firestore
  const originalSorted = useMemo(() => {
    return [...profiles]
      .map((p, index) => ({ ...p, order: p.order ?? index }))
      .sort((a, b) => a.order - b.order);
  }, [profiles]);

  // Udledt state: Brug lokal state hvis vi er i gang med at redigere, ellers brug props
  const displayProfiles = useMemo(() => {
    if (localOrder) return localOrder;
    return originalSorted;
  }, [originalSorted, localOrder]);

  const isOrderDirty = localOrder !== null;

  const moveProfileLocal = (index: number, direction: "up" | "down") => {
    const newLocal = [...displayProfiles];
    const swapIndex = direction === "up" ? index - 1 : index + 1;

    if (swapIndex < 0 || swapIndex >= newLocal.length) return;

    // Byt om lokalt
    const temp = newLocal[index];
    newLocal[index] = newLocal[swapIndex];
    newLocal[swapIndex] = temp;

    // Tjek om brugeren tilfældigvis har rykket det tilbage til den oprindelige rækkefølge
    const isIdenticalToOriginal = newLocal.every(
      (p, i) => p.id === originalSorted[i].id,
    );

    if (isIdenticalToOriginal) {
      setLocalOrder(null); // Nulstil draft - gem-knappen forsvinder
    } else {
      setLocalOrder(newLocal);
    }
  };

  const handleProfileDeleted = (id: string) => {
    // Hvis vi sletter en profil mens vi redigerer rækkefølgen, fjerner vi den fra vores draft
    if (localOrder) {
      const newLocal = localOrder.filter((p) => p.id !== id);

      // Sikkerhedstjek: Rammer vi originalen efter sletningen?
      const filteredOriginal = originalSorted.filter((p) => p.id !== id);
      const isIdenticalToOriginal = newLocal.every(
        (p, i) => p.id === filteredOriginal[i]?.id,
      );

      if (isIdenticalToOriginal) {
        setLocalOrder(null);
      } else {
        setLocalOrder(newLocal);
      }
    }
  };

  const saveProfileOrder = async () => {
    if (!auth.currentUser || !localOrder) return;
    setIsSavingOrder(true);

    // Gem variablen før closure/loopet, så TypeScript ved den ikke er null
    const userId = auth.currentUser.uid;
    const batch = writeBatch(db);

    localOrder.forEach((p, index) => {
      batch.update(doc(db, "users", userId, "profiles", p.id), {
        order: index,
      });
    });

    await batch.commit();
    setLocalOrder(null); // Nulstil draft, tilbage til Firestore lytning
    setIsSavingOrder(false);
  };

  return {
    localProfiles: displayProfiles,
    isOrderDirty,
    isSavingOrder,
    moveProfileLocal,
    saveProfileOrder,
    handleProfileDeleted,
  };
};
