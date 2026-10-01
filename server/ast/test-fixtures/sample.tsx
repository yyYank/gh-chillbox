import { useState } from "react";

export function useUser(id: string) {
  const [user, setUser] = useState(null);
  return { user, setUser };
}

export function UserPage() {
  const { user } = useUser("1");
  return <div>{user}</div>;
}

export class UserService {
  getUser(id: string) {
    return fetch(`/api/users/${id}`);
  }

  updateUser(id: string, data: unknown) {
    return fetch(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) });
  }
}

export interface UserRepository {
  findById(id: string): Promise<unknown>;
  save(user: unknown): Promise<void>;
}

export type UserDTO = {
  id: string;
  name: string;
};

function helperFn() {
  return 42;
}
