import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { accountQueryKey, logout } from "@/entities/account";
import { Button } from "@/shared/ui/button";

export function LogoutButton() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accountQueryKey });
      navigate("/");
    },
  });

  return (
    <>
      <Button disabled={logoutMutation.isPending} onClick={() => logoutMutation.mutate()} variant="secondary">
        {logoutMutation.isPending ? "로그아웃 중이에요" : "로그아웃"}
      </Button>
      {logoutMutation.isError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : null}
    </>
  );
}
