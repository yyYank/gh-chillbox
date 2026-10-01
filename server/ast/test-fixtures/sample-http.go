package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
)

func SetupRoutes(r chi.Router) {
	r.Get("/api/users", ListUsers)
	r.Post("/api/users", CreateUser)
	r.Get("/api/users/{id}", GetUser)
	r.Delete("/api/users/{id}", DeleteUser)
}

func ListUsers(w http.ResponseWriter, r *http.Request) {}
func CreateUser(w http.ResponseWriter, r *http.Request) {}
func GetUser(w http.ResponseWriter, r *http.Request)    {}
func DeleteUser(w http.ResponseWriter, r *http.Request)  {}
