"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
export function useResource<T>(path?: string) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    setData(undefined);
    setLoading(!!path);
    if (!path) {
      setData(undefined);
      return;
    }
    void api<T>(path)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, revision]);
  return {
    data,
    error,
    loading,
    reload: () => setRevision((value) => value + 1),
  };
}
