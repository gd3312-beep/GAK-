import type { UpdateUserDto } from "./user.types";
import { userRepository } from "./user.repository";

class UserService {
  async getProfile(userId: string) {
    return userRepository.findById(userId);
  }

  async updateProfile(userId: string, input: UpdateUserDto) {
    return userRepository.updateProfile(userId, input);
  }
}

export const userService = new UserService();
